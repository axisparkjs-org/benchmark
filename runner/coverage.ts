/**
 * Fails when a published package has no suite. The published packages of a version are read from the npm registry,
 * so a new package of the monorepo makes this check fail until it has a suite.
 *
 * The candidates are the packages of the scope found by the registry search and, with `--repo`, the packages of the
 * monorepo at the release tag (the search index can take a while to list a package published for the first time).
 * Each candidate counts only if the registry has the version.
 *
 * Usage: node dist/runner/coverage.js [--version <version>] [--repo axisparkjs-org/axispark] [--registry <url>] [--packages a,b,c]
 *   --version   Version to check (default: the installed version of @axisparkjs/core).
 *   --repo      GitHub repository of the monorepo, read at the tag v<version> ($GITHUB_TOKEN is used if set).
 *   --packages  Use this list of package names instead of asking the registry (offline).
 */
import { list, parseArgs } from './args';
import { axisparkVersion } from './env';
import { discoverSuites } from './suites';

const SCOPE = '@axisparkjs';
const { options } = parseArgs(process.argv.slice(2));
const registry = (typeof options.registry === 'string' ? options.registry : 'https://registry.npmjs.org').replace(/\/$/, '');
const version = typeof options.version === 'string' ? options.version : axisparkVersion();

async function json<T>(url: string): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        if (response.ok) return (await response.json()) as T;
        if (response.status === 404) throw Object.assign(new Error(`${url}: not found`), { status: 404 });
        if (attempt === 3) throw new Error(`${url}: HTTP ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
}

/** Public packages of the monorepo at the tag of the release. */
async function repositoryPackages(repo: string, target: string): Promise<string[]> {
    const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/packages?ref=v${target}`, { headers });
    if (!response.ok) throw new Error(`Could not list the packages of ${repo}@v${target}: HTTP ${response.status}`);
    const entries = (await response.json()) as { name: string; type: string }[];
    const names: string[] = [];
    for (const entry of entries.filter((item) => item.type === 'dir')) {
        const raw = await fetch(`https://raw.githubusercontent.com/${repo}/v${target}/packages/${entry.name}/package.json`);
        if (!raw.ok) continue;
        const pkg = (await raw.json()) as { name?: string; private?: boolean };
        if (pkg.name && !pkg.private) names.push(pkg.name);
    }
    return names;
}

/** Packages of the scope with the version published (the packages share the version). */
export async function publishedPackages(target: string, repo?: string): Promise<string[]> {
    const search = await json<{ objects: { package: { name: string } }[] }>(`${registry}/-/v1/search?text=${encodeURIComponent(SCOPE)}&size=250`);
    const candidates = new Set(search.objects.map((entry) => entry.package.name).filter((name) => name.startsWith(`${SCOPE}/`)));
    if (repo) for (const name of await repositoryPackages(repo, target)) candidates.add(name);

    const published: string[] = [];
    for (const name of [...candidates].sort()) {
        const packument = await json<{ versions: Record<string, { deprecated?: string }> }>(`${registry}/${name.replace('/', '%2f')}`).catch(
            (error): { versions: Record<string, { deprecated?: string }> } => {
                if ((error as { status?: number }).status === 404) return { versions: {} };
                throw error;
            }
        );
        const release = packument.versions[target];
        if (release && !release.deprecated) published.push(name);
    }
    return published;
}

async function main(): Promise<void> {
    const packages = list(options.packages)?.map((name) => (name.startsWith('@') ? name : `${SCOPE}/${name}`)) ?? (await publishedPackages(version, typeof options.repo === 'string' ? options.repo : undefined));
    if (packages.length === 0) throw new Error(`No ${SCOPE} package is published with version ${version}`);

    const suites = discoverSuites();
    const covered = new Map<string, string[]>();
    for (const { definition } of suites) covered.set(definition.package, [...(covered.get(definition.package) ?? []), definition.id]);

    const missing = packages.filter((name) => !covered.has(name));
    const unknown = [...covered.keys()].filter((name) => name !== 'scenarios' && !packages.includes(name));

    console.log(`Coverage of ${packages.length} packages published in ${version}:`);
    for (const name of packages) console.log(`  ${covered.has(name) ? '✔' : '✖'} ${name}${covered.has(name) ? `  (${covered.get(name)!.join(', ')})` : ''}`);
    if (unknown.length) console.log(`Suites of packages not published in ${version} (skipped by the run): ${unknown.join(', ')}`);
    console.log(`Transversal scenarios: ${(covered.get('scenarios') ?? []).join(', ') || 'none'}`);

    if (missing.length) {
        console.error(`\n${missing.length} published package(s) without a suite: ${missing.join(', ')}`);
        console.error('Add a suite in suites/<package>/ (see README.md).');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
