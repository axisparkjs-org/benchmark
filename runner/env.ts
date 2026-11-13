/**
 * Metadata of the environment of a run. The fingerprint identifies the machine: the comparison and the documentation
 * only put side by side the results with the same fingerprint.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import type { Environment } from './schema';
import { ROOT } from './paths';

function osRelease(): string {
    try {
        const release = readFileSync('/etc/os-release', 'utf8');
        const id = release.match(/^ID="?([^"\n]+)"?/m)?.[1];
        const version = release.match(/^VERSION_ID="?([^"\n]+)"?/m)?.[1];
        if (id) return version ? `${id}-${version}` : id;
    } catch {
        // Not Linux: use the platform.
    }
    return `${os.platform()}-${os.release().split('.')[0]}`;
}

/**
 * `gh-ubuntu-24.04-4cpu` on GitHub hosted runners, `local-<os>-<cores>cpu` elsewhere. `BENCH_FINGERPRINT` replaces
 * it, for example for a dedicated self-hosted machine.
 */
export function fingerprint(): string {
    if (process.env.BENCH_FINGERPRINT) return process.env.BENCH_FINGERPRINT;
    const where = process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT !== 'self-hosted' ? 'gh' : 'local';
    return `${where}-${osRelease()}-${os.availableParallelism()}cpu`;
}

function packageVersion(name: string): string {
    const path = join(ROOT, 'node_modules', name, 'package.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).version : 'unknown';
}

function lockfileHash(): string {
    const path = join(ROOT, 'package-lock.json');
    if (!existsSync(path)) return 'none';
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function environment(): Environment {
    const cpus = os.cpus();
    return {
        fingerprint: fingerprint(),
        node: process.versions.node,
        v8: process.versions.v8,
        os: `${os.platform()} ${os.release()}`,
        cpu: cpus[0]?.model.trim() ?? 'unknown',
        cores: os.availableParallelism(),
        memoryGb: Math.round(os.totalmem() / 2 ** 30),
        tinybench: packageVersion('tinybench'),
        lockfileHash: lockfileHash()
    };
}

/** Version of AxiSpark.js installed from npm. Every package shares it, it is read from `@axisparkjs/core`. */
export function axisparkVersion(): string {
    return packageVersion('@axisparkjs/core');
}

export function installedVersion(name: string): string | undefined {
    const version = packageVersion(name);
    return version === 'unknown' ? undefined : version;
}

if (require.main === module) {
    console.log(JSON.stringify({ axispark: axisparkVersion(), env: environment() }, null, 2));
}
