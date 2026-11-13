/**
 * The CLI downloads its templates from GitHub on every `create`. The suite measures the CLI, not the network: it
 * downloads the templates of the measured release once, and the CLI copies them from disk (its `NODE_ENV=test` mode,
 * which reads `node_modules/templates`).
 */
import { existsSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, lstatSync, mkdirSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT } from '../runner/paths';

const REPOSITORY = 'axisparkjs-org/axispark';
const LINK = join(ROOT, 'node_modules', 'templates');

async function download(url: string, file: string): Promise<boolean> {
    const response = await fetch(url);
    if (!response.ok || !response.body) return false;
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(file));
    return true;
}

export async function installTemplates(version: string): Promise<{ dir: string; dispose(): void }> {
    const dir = mkdtempSync(join(tmpdir(), 'axispark-cli-templates-'));
    const archive = join(dir, 'axispark.tar.gz');
    const found =
        (await download(`https://codeload.github.com/${REPOSITORY}/tar.gz/refs/tags/v${version}`, archive)) ||
        (await download(`https://codeload.github.com/${REPOSITORY}/tar.gz/refs/heads/main`, archive));
    if (!found) throw new Error('Could not download the templates of the CLI');

    const extracted = join(dir, 'extracted');
    mkdirSync(extracted);
    // `tar` is a dependency of the CLI.
    const tar = require('tar') as { x(options: { file: string; cwd: string; strip: number; filter: (path: string) => boolean }): Promise<void> };
    await tar.x({ file: archive, cwd: extracted, strip: 1, filter: (path) => /^[^/]+\/templates\//.test(path) });
    const templates = join(extracted, 'templates');
    if (!existsSync(templates)) throw new Error('The archive of axispark has no templates/ directory');

    if (existsSync(LINK) || isLink(LINK)) unlinkSync(LINK);
    symlinkSync(templates, LINK, 'dir');
    return {
        dir: templates,
        dispose() {
            if (isLink(LINK)) unlinkSync(LINK);
            rmSync(dir, { recursive: true, force: true });
        }
    };
}

function isLink(path: string): boolean {
    try {
        return lstatSync(path).isSymbolicLink();
    } catch {
        return false;
    }
}
