#!/usr/bin/env node
// Sets every @axisparkjs/* dependency of package.json to one exact version, the version of the run. The packages share
// their version, so a single value installs exactly what was published. A package that does not exist in that version
// (an old release measured in a backfill) is removed: its suites are skipped by the runner.
//
// Usage: node scripts/set-version.mjs <version> [--registry <url>]   then `npm install`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [version, ...args] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    console.error('Usage: node scripts/set-version.mjs <version>');
    process.exit(1);
}
const registryIndex = args.indexOf('--registry');
const registry = (registryIndex >= 0 ? args[registryIndex + 1] : 'https://registry.npmjs.org').replace(/\/$/, '');

const path = join(import.meta.dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(path, 'utf8'));

for (const name of Object.keys(pkg.dependencies).filter((name) => name.startsWith('@axisparkjs/'))) {
    const response = await fetch(`${registry}/${name.replace('/', '%2f')}`, { headers: { accept: 'application/vnd.npm.install-v1+json' } });
    const versions = response.ok ? (await response.json()).versions : {};
    if (versions[version]) {
        pkg.dependencies[name] = version;
        console.log(`${name}@${version}`);
    } else {
        delete pkg.dependencies[name];
        console.log(`${name}: not published in ${version}, removed`);
    }
}

writeFileSync(path, `${JSON.stringify(pkg, null, 4)}\n`);
