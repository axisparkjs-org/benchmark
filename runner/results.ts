/**
 * Results database: `results/<version>/node-<major>.json` files, never rewritten, and `results/index.json`, the
 * only file the website reads to build the history.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { INDEX_FILE, RESULTS_DIR } from './paths';
import { RESULT_SCHEMA, type ResultFile, type ResultIndex, type ResultIndexEntry } from './schema';
import { compare as compareVersions, isValid } from './semver';

export function readResult(path: string): ResultFile {
    const result = JSON.parse(readFileSync(path, 'utf8')) as ResultFile;
    if (result.schema !== RESULT_SCHEMA) throw new Error(`${path} has schema ${result.schema}, expected ${RESULT_SCHEMA}`);
    return result;
}

export function writeJson(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function nodeMajor(result: ResultFile): number {
    return Number(result.env.node.split('.')[0]);
}

/**
 * Path of the result of a release. A release is measured once per Node.js major in each machine: `node-<major>.json`
 * for the first machine and `node-<major>@<fingerprint>.json` when the release is measured again in another machine
 * (backfill after a change of machine). An existing file is never overwritten.
 */
export function releasePath(result: ResultFile): string {
    const dir = join(RESULTS_DIR, result.axispark.version);
    const node = nodeMajor(result);
    const primary = join(dir, `node-${node}.json`);
    if (!existsSync(primary)) return primary;
    if (readResult(primary).env.fingerprint === result.env.fingerprint) {
        throw new Error(`${relative(RESULTS_DIR, primary)} already exists for ${result.env.fingerprint}: the results are immutable`);
    }
    const secondary = join(dir, `node-${node}@${result.env.fingerprint}.json`);
    if (existsSync(secondary)) throw new Error(`${relative(RESULTS_DIR, secondary)} already exists: the results are immutable`);
    return secondary;
}

/** Every result file of `results/`, released versions only. */
export function allResults(): { file: string; result: ResultFile }[] {
    if (!existsSync(RESULTS_DIR)) return [];
    return readdirSync(RESULTS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isValid(entry.name))
        .flatMap((entry) =>
            readdirSync(join(RESULTS_DIR, entry.name))
                .filter((name) => /^node-\d+(@.+)?\.json$/.test(name))
                .map((name) => {
                    const file = join(RESULTS_DIR, entry.name, name);
                    return { file: relative(RESULTS_DIR, file), result: readResult(file) };
                })
        );
}

export function buildIndex(): ResultIndex {
    const results = allResults();
    const entries: ResultIndexEntry[] = results
        .map(({ file, result }) => ({
            version: result.axispark.version,
            node: nodeMajor(result),
            fingerprint: result.env.fingerprint,
            kind: result.run.kind,
            runId: result.run.id,
            file,
            tasks: result.tasks.length
        }))
        .sort((a, b) => compareVersions(b.version, a.version) || b.node - a.node || a.fingerprint.localeCompare(b.fingerprint));

    const environments = new Map<string, Set<number>>();
    for (const entry of entries) {
        environments.set(entry.fingerprint, (environments.get(entry.fingerprint) ?? new Set()).add(entry.node));
    }

    return {
        schema: RESULT_SCHEMA,
        // The id of the newest run, not the current time: the index is reproducible from the result files.
        updatedAt: entries.map((entry) => entry.runId).sort().at(-1) ?? null,
        releases: [...new Set(entries.map((entry) => entry.version))],
        environments: [...environments].map(([fingerprint, nodes]) => ({ fingerprint, node: [...nodes].sort((a, b) => a - b) })),
        results: entries
    };
}

export function writeIndex(): ResultIndex {
    const index = buildIndex();
    writeJson(INDEX_FILE, index);
    return index;
}

export function readIndex(): ResultIndex {
    return existsSync(INDEX_FILE) ? (JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as ResultIndex) : buildIndex();
}
