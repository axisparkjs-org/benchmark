import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createApp } from '../../fixtures/app';
import { generateTree } from '../../fixtures/scan/generate';
import { defineSuite } from '../../runner/define-suite';

const run = promisify(execFile);
const BOOT = join(__dirname, '..', '..', 'fixtures', 'scan', 'boot.js');

interface Ctx {
    empty: string;
    tree50: string;
    tree500: string;
}

/** A new process that boots an application scanning `basePath`: the modules are loaded for the first time. */
const cold = (basePath: string) => run(process.execPath, [BOOT, basePath]);

/** In the process of the suite: the modules are already loaded, it measures the search of the files and the binding of the classes. */
async function warm(basePath: string) {
    const app = createApp({ basePath, scan: 'file-system' });
    await app.init();
    await app.destroy();
}

export default defineSuite<Ctx>({
    package: 'scenarios',
    id: 'boot.scan',
    version: 1,
    tier: 'app',
    description: 'Boots an application that discovers 50 and 500 files with the scanner, in a new process (cold) and in the same process (warm).',
    baseline: { 'cold-50': 'cold-0', 'cold-500': 'cold-0' },
    setup: () => ({
        empty: mkdtempSync(join(tmpdir(), 'axispark-scan-0-')),
        tree50: generateTree(50),
        tree500: generateTree(500)
    }),
    tasks: {
        'cold-0': (ctx) => cold(ctx.empty),
        'cold-50': (ctx) => cold(ctx.tree50),
        'cold-500': (ctx) => cold(ctx.tree500),
        'warm-50': (ctx) => warm(ctx.tree50),
        'warm-500': (ctx) => warm(ctx.tree500)
    },
    teardown: (ctx) => {
        for (const dir of [ctx.empty, ctx.tree50, ctx.tree500]) rmSync(dir, { recursive: true, force: true });
    }
});
