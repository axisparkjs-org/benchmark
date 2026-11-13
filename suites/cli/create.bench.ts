import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { installTemplates } from '../../fixtures/cli-templates';
import { axisparkVersion } from '../../runner/env';
import { ROOT } from '../../runner/paths';
import { defineSuite } from '../../runner/define-suite';

const run = promisify(execFile);
const CLI = join(ROOT, 'node_modules', '@axisparkjs', 'cli', 'lib', 'index.js');

interface Ctx {
    templates: { dispose(): void };
    work: string;
    count: number;
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/cli',
    id: 'cli.create',
    version: 1,
    tier: 'app',
    description: 'Starts the CLI and generates a project from the default template in a temporary directory.',
    baseline: { help: 'raw-node' },
    setup: async () => {
        const templates = await installTemplates(axisparkVersion());
        const work = mkdtempSync(join(tmpdir(), 'axispark-cli-'));
        const ctx = { templates, work, count: 0 };
        await createProject(ctx);
        if (!existsSync(join(work, 'app-0', 'package.json'))) throw new Error('The CLI did not generate the project');
        return ctx;
    },
    tasks: {
        help: () => run(process.execPath, [CLI, '--help']),
        'create-default': { fn: (ctx) => createProject(ctx), afterEach: (ctx) => rmSync(join(ctx.work, `app-${ctx.count - 1}`), { recursive: true, force: true }) },
        // Starting Node.js without the CLI: the reference of `help`.
        'raw-node': () => run(process.execPath, ['-e', ''])
    },
    teardown: (ctx) => {
        ctx.templates.dispose();
        rmSync(ctx.work, { recursive: true, force: true });
    }
});

async function createProject(ctx: Ctx): Promise<void> {
    const name = `app-${ctx.count++}`;
    await run(process.execPath, [CLI, 'create', name, '--template', 'default', '--no-install'], {
        cwd: ctx.work,
        env: { ...process.env, NODE_ENV: 'test', CI: 'true', FORCE_COLOR: '0' }
    });
}
