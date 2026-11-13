/**
 * Options shared by every suite. They are part of the measurement: changing any of them changes every series, so
 * they stay fixed between releases. If they ever change, increase `BENCH_CONFIG_VERSION` and every suite starts a
 * new series in the documentation.
 */
export const BENCH_CONFIG_VERSION = 1;

export const benchConfig = {
    /** Time budget per task in milliseconds. */
    time: 1000,
    /** Warm-up time budget per task in milliseconds. */
    warmupTime: 250,
    /** Nanosecond resolution timer of Node.js. */
    timestampProvider: 'hrtimeNow',
    /** Runs of every suite, each one in a new process. The result keeps the median of every metric. */
    repetitions: 3,
    /** Measurements of `heapUsed` per memory probe. The result keeps the median. */
    memorySamples: 5
} as const;

/**
 * Options of a quick run, only for local development (`--quick`). Its results are never written in `results/`.
 */
export const quickConfig = {
    ...benchConfig,
    time: 100,
    warmupTime: 25,
    repetitions: 1,
    memorySamples: 1
} as const;

export type BenchConfig = typeof benchConfig | typeof quickConfig;
