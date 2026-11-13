/**
 * Discovers the suites, runs each one in new processes (`benchConfig.repetitions` times), keeps the median of every
 * metric and writes the result of the run.
 *
 * Usage: node dist/runner/run.js [options]
 *   --tier micro,app,infra   Only the suites of these tiers.
 *   --suite di,boot.plugins  Only these suites (id or prefix of the id).
 *   --package di,core        Only the suites of these packages.
 *   --kind release|backfill|snapshot   Kind of run (default: snapshot). Release and backfill runs are saved in results/.
 *   --sha <commit>           Release commit of axispark (default: $AXISPARK_SHA).
 *   --out <file>             Write the result in this file instead of the default path.
 *   --quick                  Short measurement for local development. Never saved in results/.
 *   --strict                 Exit with an error if a suite fails.
 *   --list                   List the suites and exit.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { BENCH_CONFIG_VERSION, benchConfig, quickConfig } from '../bench.config';
import { list, parseArgs } from './args';
import { taskId, type Tier } from './define-suite';
import { axisparkVersion, environment } from './env';
import { OUT_DIR, ROOT } from './paths';
import { releasePath, writeIndex, writeJson } from './results';
import { RESULT_SCHEMA, type RawSuite, type ResultFile, type RunKind, type TaskResult } from './schema';
import { median, round } from './stats';
import { discoverSuites, filterSuites, isInstalled, unloadedSuites, type SuiteEntry } from './suites';
import { gitSha } from './git';

const { options } = parseArgs(process.argv.slice(2), ['quick', 'strict', 'list']);
const quick = options.quick === true;
const config = quick ? quickConfig : benchConfig;
const kind = (typeof options.kind === 'string' ? options.kind : 'snapshot') as RunKind;
if (!['release', 'backfill', 'snapshot'].includes(kind)) throw new Error(`Invalid --kind '${kind}'`);
if (quick && kind !== 'snapshot') throw new Error('A --quick run is always a snapshot: its results are not comparable');

function runWorker(entry: SuiteEntry, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const args = ['--expose-gc', join(__dirname, 'worker.js'), entry.file, output, ...(quick ? ['--quick'] : [])];
        const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, NODE_ENV: 'production' } });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(signal ? `worker killed by ${signal}` : `worker exited with code ${code}`));
        });
    });
}

function aggregate(runs: RawSuite[]): TaskResult[] {
    const [first] = runs;
    return first.tasks.map(({ task }) => {
        const samples = runs.map((run) => {
            const found = run.tasks.find((t) => t.task === task);
            if (!found) throw new Error(`Task '${task}' missing in a repetition of ${first.suite}`);
            return found;
        });
        const pick = <T>(get: (t: (typeof samples)[number]) => T) => samples.map(get);
        const baseline = first.baselines[task] ?? null;
        const ratios = baseline
            ? runs.map((run) => {
                  const own = run.tasks.find((t) => t.task === task)!.latencyNs.p50;
                  const reference = run.tasks.find((t) => t.task === baseline)!.latencyNs.p50;
                  return own / reference;
              })
            : [];
        const heaps = pick((t) => t.heapBytes).filter((value): value is number => value !== null);
        return {
            id: taskId({ package: first.package, id: first.suite, version: first.version }, task),
            package: first.package,
            suite: first.suite,
            task,
            tier: first.tier,
            latencyNs: {
                mean: round(median(pick((t) => t.latencyNs.mean))),
                p50: round(median(pick((t) => t.latencyNs.p50))),
                p75: round(median(pick((t) => t.latencyNs.p75))),
                p99: round(median(pick((t) => t.latencyNs.p99))),
                mad: round(median(pick((t) => t.latencyNs.mad))),
                rme: round(median(pick((t) => t.latencyNs.rme)))
            },
            throughputOps: {
                mean: round(median(pick((t) => t.throughputOps.mean))),
                p50: round(median(pick((t) => t.throughputOps.p50)))
            },
            samples: Math.round(median(pick((t) => t.samples))),
            baselineRatio: baseline ? round(median(ratios), 4) : null,
            baseline,
            heapBytes: heaps.length ? Math.round(median(heaps)) : null
        };
    });
}

function formatNs(ns: number): string {
    if (ns >= 1e9) return `${(ns / 1e9).toFixed(2)} s`;
    if (ns >= 1e6) return `${(ns / 1e6).toFixed(2)} ms`;
    if (ns >= 1e3) return `${(ns / 1e3).toFixed(2)} µs`;
    return `${ns.toFixed(0)} ns`;
}

function summary(result: ResultFile): string {
    const rows = result.tasks.map(
        (t) =>
            `| \`${t.package}\` | ${t.suite} | ${t.task} | ${formatNs(t.latencyNs.p50)} | ±${t.latencyNs.rme.toFixed(2)} % | ${Math.round(t.throughputOps.p50).toLocaleString('en-US')} | ${t.baselineRatio ?? ''} | ${t.heapBytes === null ? '' : `${(t.heapBytes / 1024).toFixed(0)} KiB`} |`
    );
    const errors = (result.errors ?? []).map((e) => `- **${e.suite}**: ${e.message}`);
    return [
        `### AxiSpark.js ${result.axispark.version} on Node.js ${result.env.node} (${result.env.fingerprint})`,
        '',
        '| Package | Suite | Task | p50 | rme | ops/s (p50) | ratio | heap |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rows,
        ...(errors.length ? ['', '**Suites that failed**', '', ...errors] : []),
        ''
    ].join('\n');
}

async function main(): Promise<void> {
    const suites = filterSuites(discoverSuites(), {
        tiers: list(options.tier) as Tier[] | undefined,
        suites: list(options.suite),
        packages: list(options.package)
    });

    if (options.list) {
        for (const { name, definition } of suites) {
            console.log(`${definition.tier.padEnd(5)} ${definition.id.padEnd(28)} v${definition.version}  ${definition.package}  (${name})`);
        }
        return;
    }
    if (suites.length === 0) throw new Error('No suite matches the filters');

    const version = axisparkVersion();
    const work = mkdtempSync(join(tmpdir(), 'axispark-bench-'));
    const tasks: TaskResult[] = [];
    const errors: { suite: string; message: string }[] = [];

    // The suites that cannot be loaded with the packages of this release. Without filters, the ones that are not
    // explained by a missing package are errors of the run.
    const filtered = Boolean(options.tier || options.suite || options.package);
    for (const { name, missingPackage, message } of unloadedSuites) {
        if (missingPackage) {
            console.log(`- ${name}: ${missingPackage} is not published in ${version}, skipped`);
        } else {
            console.error(`✖ ${name}: cannot be loaded with ${version}: ${message}`);
            if (!filtered) errors.push({ suite: name.replace(/\//g, '.'), message: `Cannot be loaded: ${message}` });
        }
    }

    try {
        for (const entry of suites) {
            const { definition } = entry;
            if (!isInstalled(definition)) {
                console.log(`- ${definition.id}: ${definition.package} is not published in ${version}, skipped`);
                continue;
            }
            const runs: RawSuite[] = [];
            try {
                for (let repetition = 1; repetition <= config.repetitions; repetition++) {
                    console.log(`▶ ${definition.id} (${definition.tier}) ${repetition}/${config.repetitions}`);
                    const output = join(work, `${definition.id}.${repetition}.json`);
                    await runWorker(entry, output);
                    runs.push(JSON.parse(readFileSync(output, 'utf8')) as RawSuite);
                }
                tasks.push(...aggregate(runs));
            } catch (error) {
                const message = (error as Error).message;
                console.error(`✖ ${definition.id}: ${message}`);
                errors.push({ suite: definition.id, message });
            }
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }

    const now = new Date();
    const result: ResultFile = {
        schema: RESULT_SCHEMA,
        axispark: { version, tag: `v${version}`, sha: (typeof options.sha === 'string' ? options.sha : process.env.AXISPARK_SHA) || null },
        run: {
            id: now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z'),
            benchSha: process.env.GITHUB_SHA ?? gitSha(),
            kind,
            configVersion: BENCH_CONFIG_VERSION,
            repetitions: config.repetitions
        },
        env: environment(),
        tasks,
        ...(errors.length ? { errors } : {})
    };

    let path: string;
    if (typeof options.out === 'string') {
        path = options.out;
    } else if (kind === 'snapshot') {
        path = join(OUT_DIR, `${version}-node-${process.versions.node.split('.')[0]}-${result.run.id}.json`);
    } else {
        path = releasePath(result);
    }

    writeJson(path, result);
    if (kind !== 'snapshot' && relative(join(ROOT, 'results'), path).split('/').length === 2) writeIndex();

    const markdown = summary(result);
    console.log(`\n${markdown}`);
    console.log(`Result written to ${relative(process.cwd(), path)}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${relative(ROOT, path)}\n`);

    if (errors.length && options.strict) process.exitCode = 1;
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
});
