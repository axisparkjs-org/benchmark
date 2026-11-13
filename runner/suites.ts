import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { SuiteDefinition, Tier } from './define-suite';
import { installedVersion } from './env';
import { SUITES_DIR } from './paths';

export interface SuiteEntry {
    file: string;
    /** Path relative to `suites/`, without extension. */
    name: string;
    definition: SuiteDefinition;
}

function walk(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.name.endsWith('.bench.js') ? [path] : [];
    });
}

/** A suite that could not be loaded with the installed packages. */
export interface UnloadedSuite {
    name: string;
    /** The @axisparkjs package that is not installed (old release), when that is the reason. */
    missingPackage?: string;
    message: string;
}

/** Suites of the last `discoverSuites()` that could not be loaded. */
export const unloadedSuites: UnloadedSuite[] = [];

/** The @axisparkjs package that a `MODULE_NOT_FOUND` error could not find. */
function missingPackage(error: unknown): string | undefined {
    if ((error as NodeJS.ErrnoException)?.code !== 'MODULE_NOT_FOUND') return undefined;
    return /Cannot find module '(@axisparkjs\/[^/']+)/.exec((error as Error).message)?.[1];
}

/**
 * Every compiled suite, sorted by package and id. Loading a suite only defines it: nothing runs until `setup`.
 *
 * The suites are compiled with the packages of package.json, but they run with the packages of the measured release.
 * An old release may not have a package, or may not export what a suite imports: that suite is left out (see
 * `unloadedSuites`) and the others run.
 */
export function discoverSuites(): SuiteEntry[] {
    const files = walk(SUITES_DIR);
    if (files.length === 0) throw new Error(`No suites in ${SUITES_DIR}: run 'npm run build' first`);
    unloadedSuites.length = 0;
    const entries = files.flatMap((file) => {
        const name = relative(SUITES_DIR, file).replace(/\.bench\.js$/, '');
        let loaded;
        try {
            loaded = require(file);
        } catch (error) {
            unloadedSuites.push({ name, missingPackage: missingPackage(error), message: (error as Error).message.split('\n')[0] });
            return [];
        }
        const definition: SuiteDefinition = loaded.default ?? loaded;
        if (!definition?.id || !definition.tasks) throw new Error(`${file} does not export a suite (export default defineSuite(...))`);
        return [{ file, name, definition }];
    });

    const ids = new Map<string, string>();
    for (const { name, definition } of entries) {
        const other = ids.get(definition.id);
        if (other) throw new Error(`Suites ${other} and ${name} have the same id '${definition.id}'`);
        ids.set(definition.id, name);
    }
    return entries.sort((a, b) => a.definition.package.localeCompare(b.definition.package) || a.definition.id.localeCompare(b.definition.id));
}

export interface SuiteFilter {
    tiers?: Tier[];
    /** Suite ids or prefixes (`di`, `boot.plugins`). */
    suites?: string[];
    /** Package names, with or without the `@axisparkjs/` scope. */
    packages?: string[];
}

export function filterSuites(entries: SuiteEntry[], filter: SuiteFilter): SuiteEntry[] {
    const packages = filter.packages?.map((name) => (name === 'scenarios' || name.startsWith('@') ? name : `@axisparkjs/${name}`));
    return entries.filter(({ definition }) => {
        if (filter.tiers?.length && !filter.tiers.includes(definition.tier)) return false;
        if (packages?.length && !packages.includes(definition.package)) return false;
        if (filter.suites?.length && !filter.suites.some((id) => definition.id === id || definition.id.startsWith(`${id}.`))) return false;
        return true;
    });
}

/** Whether the package of the suite is installed. Old releases (backfill) may not have every package. */
export function isInstalled(definition: SuiteDefinition): boolean {
    return definition.package === 'scenarios' || installedVersion(definition.package) !== undefined;
}
