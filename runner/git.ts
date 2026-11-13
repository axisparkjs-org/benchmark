import { execFileSync } from 'node:child_process';
import { ROOT } from './paths';

/** Commit of the benchmarks repository, or `null` outside a git checkout. */
export function gitSha(): string | null {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return null;
    }
}
