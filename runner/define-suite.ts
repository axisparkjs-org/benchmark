/**
 * Contract of a suite. Every `suites/**\/*.bench.ts` file exports a declarative definition and the runner creates
 * the tinybench `Bench`, so the configuration of the measurement is the same in every suite.
 */

export type Tier = 'micro' | 'app' | 'infra';

/** A task: the function measured by tinybench, or the function with hooks that are not measured. */
export type TaskFn<C> = (ctx: C) => unknown | Promise<unknown>;

export interface TaskDefinition<C> {
    fn: TaskFn<C>;
    /** Runs once before the warm-up and once before the measured iterations of this task. */
    beforeAll?: TaskFn<C>;
    /** Runs once after the warm-up and once after the measured iterations of this task. */
    afterAll?: TaskFn<C>;
    /** Runs before every iteration, outside the measured time. */
    beforeEach?: TaskFn<C>;
    /** Runs after every iteration, outside the measured time. */
    afterEach?: TaskFn<C>;
}

/**
 * A memory probe: creates the measured state (for example an application after `init()`) and returns the function
 * that releases it. The runner reads `heapUsed` after a `gc()` before and after the probe.
 */
export type MemoryProbe<C> = (ctx: C) => Promise<() => Promise<void> | void>;

export interface SuiteDefinition<C = any> {
    /** Package measured by the suite, or `scenarios` for the transversal scenarios. */
    package: string;
    /** Identifier of the suite, `<area>.<name>`. */
    id: string;
    /** Version of the suite: increase it when a task changes in a relevant way, it starts a new series. */
    version: number;
    tier: Tier;
    /** Short description, shown in the reports. */
    description?: string;
    /**
     * Reference task without the framework. A string compares it with every other task of the suite. A map pairs each
     * task with its own reference (`{ get: 'raw-get', post: 'raw-post' }`).
     */
    baseline?: string | Record<string, string>;
    setup?: () => C | Promise<C>;
    tasks: Record<string, TaskFn<C> | TaskDefinition<C>>;
    /** Memory probes, by task name. The result saves their `heapUsed` in `heapBytes`. */
    memory?: Record<string, MemoryProbe<C>>;
    teardown?: (ctx: C) => void | Promise<void>;
}

export function defineSuite<C = undefined>(definition: SuiteDefinition<C>): SuiteDefinition<C> {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(definition.id)) {
        throw new Error(`Invalid suite id '${definition.id}': use <area>.<name> in lower case`);
    }
    if (!Number.isInteger(definition.version) || definition.version < 1) {
        throw new Error(`Invalid version of suite '${definition.id}': it must be a positive integer`);
    }
    for (const baseline of baselines(definition)) {
        if (!(baseline in definition.tasks)) throw new Error(`Suite '${definition.id}' has no baseline task '${baseline}'`);
    }
    return definition;
}

export function baselines(definition: SuiteDefinition): string[] {
    if (!definition.baseline) return [];
    return typeof definition.baseline === 'string' ? [definition.baseline] : [...new Set(Object.values(definition.baseline))];
}

/** Baseline task of a task, or `undefined` when it has none or it is a baseline itself. */
export function baselineOf(definition: SuiteDefinition, task: string): string | undefined {
    if (!definition.baseline || baselines(definition).includes(task)) return undefined;
    return typeof definition.baseline === 'string' ? definition.baseline : definition.baseline[task];
}

/** Stable identifier of a task: `<package>/<suite>@v<version>/<task>`. It is the key of its time series. */
export function taskId(definition: Pick<SuiteDefinition, 'package' | 'id' | 'version'>, task: string): string {
    return `${definition.package}/${definition.id}@v${definition.version}/${task}`;
}
