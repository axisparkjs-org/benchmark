/**
 * Runs one suite in its own process and writes its raw measurements. Every suite (and every repetition) gets a new
 * process, so the classes registered by the decorators of one suite, the JIT state and the heap of a run never
 * affect another one.
 *
 * Usage: node --expose-gc dist/runner/worker.js <suite file> <output file> [--quick]
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { Bench, type Task } from 'tinybench';
import { benchConfig, quickConfig } from '../bench.config';
import { baselineOf, type SuiteDefinition, type TaskDefinition } from './define-suite';
import type { RawSuite, RawTask } from './schema';
import { median, round } from './stats';

const [file, output, ...flags] = process.argv.slice(2);
const config = flags.includes('--quick') ? quickConfig : benchConfig;

function gc(): void {
    const collect = (globalThis as { gc?: () => void }).gc;
    if (!collect) throw new Error('Run the worker with --expose-gc to measure the memory');
    collect();
    collect();
}

function normalize<C>(task: SuiteDefinition<C>['tasks'][string]): TaskDefinition<C> {
    return typeof task === 'function' ? { fn: task } : task;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}

/** Runs the task once with its hooks, to check that it works and whether it is asynchronous. */
async function probe<C>(name: string, task: TaskDefinition<C>, ctx: C): Promise<boolean> {
    try {
        await task.beforeAll?.(ctx);
        await task.beforeEach?.(ctx);
        const result = task.fn(ctx);
        const async = isThenable(result);
        if (async) await result;
        await task.afterEach?.(ctx);
        await task.afterAll?.(ctx);
        return async;
    } catch (error) {
        throw new Error(`Task '${name}' failed before the measurement: ${(error as Error).stack ?? error}`);
    }
}

async function measureMemory<C>(probe: (ctx: C) => Promise<() => Promise<void> | void>, ctx: C): Promise<number> {
    // A first probe that is not measured: it loads the modules and fills the caches that the probe uses only once.
    await (await probe(ctx))();
    const samples: number[] = [];
    for (let i = 0; i < config.memorySamples; i++) {
        gc();
        const before = process.memoryUsage().heapUsed;
        const dispose = await probe(ctx);
        gc();
        const after = process.memoryUsage().heapUsed;
        await dispose();
        samples.push(after - before);
    }
    return Math.round(median(samples));
}

function toRaw(task: Task, heapBytes: number | null): RawTask {
    const result = task.result;
    if (result.state === 'errored') throw new Error(`Task '${task.name}' failed: ${result.error.stack ?? result.error}`);
    if (result.state !== 'completed') throw new Error(`Task '${task.name}' did not complete (${result.state})`);
    const ns = (ms: number) => round(ms * 1e6);
    const { latency, throughput } = result;
    return {
        task: task.name,
        latencyNs: {
            mean: ns(latency.mean),
            p50: ns(latency.p50),
            p75: ns(latency.p75),
            p99: ns(latency.p99),
            mad: ns(latency.mad),
            rme: round(latency.rme)
        },
        throughputOps: { mean: round(throughput.mean), p50: round(throughput.p50) },
        samples: latency.samplesCount,
        heapBytes
    };
}

async function main(): Promise<void> {
    const loaded = require(file);
    const suite: SuiteDefinition = loaded.default ?? loaded;
    const ctx = await suite.setup?.();

    try {
        const heap = new Map<string, number>();
        for (const [name, memoryProbe] of Object.entries(suite.memory ?? {})) {
            heap.set(name, await measureMemory(memoryProbe, ctx));
        }

        const bench = new Bench({
            name: suite.id,
            time: config.time,
            warmupTime: config.warmupTime,
            timestampProvider: config.timestampProvider,
            throws: true
        });

        for (const [name, raw] of Object.entries(suite.tasks)) {
            const task = normalize(raw);
            const async = await probe(name, task, ctx);
            bench.add(name, async ? async () => void (await task.fn(ctx)) : () => void task.fn(ctx), {
                async,
                beforeAll: task.beforeAll && (async () => void (await task.beforeAll?.(ctx))),
                afterAll: task.afterAll && (async () => void (await task.afterAll?.(ctx))),
                beforeEach: task.beforeEach && (async () => void (await task.beforeEach?.(ctx))),
                afterEach: task.afterEach && (async () => void (await task.afterEach?.(ctx)))
            });
        }

        await bench.run();

        const pairs: Record<string, string> = {};
        for (const name of Object.keys(suite.tasks)) {
            const baseline = baselineOf(suite, name);
            if (baseline) pairs[name] = baseline;
        }

        const raw: RawSuite = {
            suite: suite.id,
            package: suite.package,
            version: suite.version,
            tier: suite.tier,
            tasks: bench.tasks.map((task) => toRaw(task, heap.get(task.name) ?? null)),
            baselines: pairs
        };
        writeFileSync(output, JSON.stringify(raw));
    } finally {
        await suite.teardown?.(ctx);
    }
}

main().then(
    // Open handles of a suite (sockets, timers of a client) must not keep the worker alive.
    () => process.exit(0),
    (error: unknown) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exit(1);
    }
);
