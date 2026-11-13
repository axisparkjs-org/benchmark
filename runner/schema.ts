/**
 * Format of the files in `results/`. Each run of a release writes one immutable file per Node.js version
 * (`results/<version>/node-<major>.json`). Increase `RESULT_SCHEMA` when the format changes incompatibly.
 */
import type { Tier } from './define-suite';

export const RESULT_SCHEMA = 1;

export type RunKind = 'release' | 'backfill' | 'snapshot';

export interface Environment {
    /** Identifies the machine: only the results with the same fingerprint are compared. */
    fingerprint: string;
    node: string;
    v8: string;
    os: string;
    cpu: string;
    cores: number;
    memoryGb: number;
    tinybench: string;
    /** sha256 of package-lock.json: the exact dependencies of the run. */
    lockfileHash: string;
}

export interface LatencyNs {
    mean: number;
    p50: number;
    p75: number;
    p99: number;
    mad: number;
    /** Relative margin of error of the mean, in percent. */
    rme: number;
}

export interface TaskResult {
    /** `<package>/<suite>@v<version>/<task>` */
    id: string;
    package: string;
    suite: string;
    task: string;
    tier: Tier;
    latencyNs: LatencyNs;
    throughputOps: { mean: number; p50: number };
    samples: number;
    /** p50 of the task / p50 of its reference without the framework. */
    baselineRatio: number | null;
    /** Reference task of `baselineRatio`. */
    baseline: string | null;
    /** `heapUsed` retained by the memory probe of the task, in bytes. */
    heapBytes: number | null;
}

export interface ResultFile {
    schema: number;
    axispark: { version: string; tag: string; sha: string | null };
    run: { id: string; benchSha: string | null; kind: RunKind; configVersion: number; repetitions: number };
    env: Environment;
    tasks: TaskResult[];
    /** Suites that could not run (for example, a service of the `infra` tier was not available). */
    errors?: { suite: string; message: string }[];
}

export interface ResultIndexEntry {
    version: string;
    node: number;
    fingerprint: string;
    kind: RunKind;
    runId: string;
    /** Path relative to `results/`. */
    file: string;
    tasks: number;
}

export interface ResultIndex {
    schema: number;
    /** Id of the newest run in the index. */
    updatedAt: string | null;
    /** Released versions, from the newest to the oldest. */
    releases: string[];
    environments: { fingerprint: string; node: number[] }[];
    results: ResultIndexEntry[];
}

/** Raw measurement of one task in one repetition, written by the worker. */
export interface RawTask {
    task: string;
    latencyNs: LatencyNs;
    throughputOps: { mean: number; p50: number };
    samples: number;
    heapBytes: number | null;
}

export interface RawSuite {
    suite: string;
    package: string;
    version: number;
    tier: Tier;
    tasks: RawTask[];
    baselines: Record<string, string>;
}
