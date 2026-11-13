import { ClassGroups, createApp } from '../../fixtures/app';
import { syntheticPlugins } from '../../fixtures/plugins';
import { defineSuite } from '../../runner/define-suite';

const groups = new ClassGroups();
const plugins10 = syntheticPlugins(10);
const plugins100 = syntheticPlugins(100);
groups.add('10', plugins10);
groups.add('100', plugins100);

/** Registers the plugins and resolves their order (init) without the scan or the start. */
async function registerAndOrder(plugins: typeof plugins10) {
    const app = createApp({ plugins });
    await app.init();
    await app.destroy();
}

export default defineSuite({
    package: '@axisparkjs/core',
    id: 'core.plugins',
    version: 1,
    tier: 'micro',
    description: 'Registers plugins with dependencies between them and runs their lifecycle in dependency order.',
    tasks: {
        'register-order-10': { fn: () => registerAndOrder(plugins10), beforeAll: () => groups.only('10') },
        'register-order-100': { fn: () => registerAndOrder(plugins100), beforeAll: () => groups.only('100') },
        'use-100': {
            fn: () => {
                const app = createApp();
                for (const plugin of plugins100) app.use(plugin);
                return app;
            },
            beforeAll: () => groups.only('100')
        }
    }
});
