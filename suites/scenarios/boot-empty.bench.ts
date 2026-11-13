import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxiSparkFactory } from '@axisparkjs/core';
import { nullTransports } from '../../fixtures/app';
import { defineSuite } from '../../runner/define-suite';

function create(basePath: string) {
    return AxiSparkFactory.create({ name: 'Empty', basePath, banner: false, logTransports: nullTransports() });
}

export default defineSuite<{ basePath: string }>({
    package: 'scenarios',
    id: 'boot.empty',
    version: 1,
    tier: 'app',
    description: 'AxiSparkFactory.create() + init() + destroy() of an application without plugins nor files.',
    setup: () => ({ basePath: mkdtempSync(join(tmpdir(), 'axispark-empty-')) }),
    tasks: {
        'create-init-destroy': async (ctx) => {
            const app = create(ctx.basePath);
            await app.init();
            await app.destroy();
        }
    },
    memory: {
        'create-init-destroy': async (ctx) => {
            const app = create(ctx.basePath);
            await app.init();
            return () => app.destroy();
        }
    },
    teardown: (ctx) => rmSync(ctx.basePath, { recursive: true, force: true })
});
