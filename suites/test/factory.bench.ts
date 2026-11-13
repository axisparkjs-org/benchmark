import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@axisparkjs/di';
import { Logger } from '@axisparkjs/logger';
import { AxiSparkTestFactory } from '@axisparkjs/test';
import { createApp } from '../../fixtures/app';
import { defineSuite } from '../../runner/define-suite';
import type { AxiSparkCore } from '@axisparkjs/core';

@Injectable()
class OrderService {
    constructor(readonly logger: Logger) {}
}

const MOCKS = Array.from({ length: 9 }, (_, index) => ({ token: `MOCK_${index}`, useValue: { index } }));
const PROVIDERS = [{ token: Logger, useValue: { info: () => undefined, child: () => undefined } }, ...MOCKS.slice(0, 8), OrderService];

export default defineSuite<{ app: AxiSparkCore; dir: string }>({
    package: '@axisparkjs/test',
    id: 'test.factory',
    version: 1,
    tier: 'micro',
    description: 'Creates a test application with 10 providers, from an application with an empty base path.',
    setup: () => {
        // The test application scans the base path of the application: an empty directory, like a project without files.
        const dir = mkdtempSync(join(tmpdir(), 'axispark-test-'));
        return { app: createApp({ basePath: dir }), dir };
    },
    tasks: {
        'create-10': (ctx) => AxiSparkTestFactory.create({ app: ctx.app, providers: PROVIDERS as never }),
        'create-init-get-10': async (ctx) => {
            const app = AxiSparkTestFactory.create({ app: ctx.app, providers: PROVIDERS as never });
            await app.init();
            const service = await app.get(OrderService);
            await app.destroy();
            return service;
        }
    },
    teardown: (ctx) => rmSync(ctx.dir, { recursive: true, force: true })
});
