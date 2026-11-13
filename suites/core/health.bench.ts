import { HealthEngine, HealthIndicator, HealthStatus, type HealthCheckResult } from '@axisparkjs/core';
import { createApp } from '../../fixtures/app';
import { syntheticPlugins } from '../../fixtures/plugins';
import { defineSuite } from '../../runner/define-suite';

class StaticIndicator extends HealthIndicator {
    constructor(private readonly index: number) {
        super();
    }

    async check(): Promise<HealthCheckResult> {
        return { status: HealthStatus.Healthy, details: { index: this.index } };
    }
}

export default defineSuite({
    package: '@axisparkjs/core',
    id: 'core.health',
    version: 1,
    tier: 'micro',
    description: 'Health engine with 10 indicators and 5 started plugins.',
    setup: async () => {
        const app = createApp({ plugins: syntheticPlugins(5) });
        await app.init();
        await app.run();
        const health = await app.get(HealthEngine);
        for (let index = 0; index < 10; index++) health.register(new StaticIndicator(index), { name: `indicator-${index}` });
        return { app, health };
    },
    tasks: {
        'check-all-10': (ctx) => ctx.health.checkAll(),
        'check-app-10': (ctx) => ctx.health.checkApp()
    },
    teardown: (ctx) => ctx.app.destroy()
});
