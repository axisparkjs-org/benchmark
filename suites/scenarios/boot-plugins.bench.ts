import { ClassGroups, createApp } from '../../fixtures/app';
import { syntheticPlugins } from '../../fixtures/plugins';
import { defineSuite } from '../../runner/define-suite';
import type { PluginType } from '@axisparkjs/core';

const SIZES = [10, 100, 500] as const;
const groups = new ClassGroups();
const plugins = new Map<number, PluginType[]>();
for (const size of SIZES) {
    plugins.set(size, syntheticPlugins(size, 3, `Boot${size}x`));
    groups.add(String(size), plugins.get(size)!);
}

async function boot(size: number) {
    const app = createApp({ plugins: plugins.get(size) });
    await app.init();
    await app.run();
    return app;
}

export default defineSuite({
    package: 'scenarios',
    id: 'boot.plugins',
    version: 1,
    tier: 'app',
    description: 'Boots (init + run) and destroys an application with N synthetic plugins with dependencies between them.',
    tasks: Object.fromEntries(
        SIZES.map((size) => [
            `n${size}`,
            {
                fn: async () => (await boot(size)).destroy(),
                beforeAll: () => groups.only(String(size))
            }
        ])
    ),
    memory: Object.fromEntries(
        SIZES.map((size) => [
            `n${size}`,
            async () => {
                groups.only(String(size));
                const app = await boot(size);
                return () => app.destroy();
            }
        ])
    )
});
