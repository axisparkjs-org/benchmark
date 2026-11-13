import { ClassGroups, createApp } from '../../fixtures/app';
import { syntheticControllers } from '../../fixtures/controllers';
import { memoryHttpPlugin } from '../../fixtures/http';
import { defineSuite } from '../../runner/define-suite';

const groups = new ClassGroups();
groups.add('10', syntheticControllers(10).controllers);
groups.add('500', syntheticControllers(500).controllers);

/** Generates, validates and registers the route table: what the HTTP plugin does at `init()`. */
async function routeTable(): Promise<void> {
    const app = createApp({ plugins: [memoryHttpPlugin()] });
    await app.init();
    await app.destroy();
}

export default defineSuite({
    package: '@axisparkjs/http',
    id: 'http.routes',
    version: 1,
    tier: 'micro',
    description: 'Builds the route table (generation and conflict validation) with 10 and 500 routes.',
    tasks: {
        'table-10': { fn: routeTable, beforeAll: () => groups.only('10') },
        'table-500': { fn: routeTable, beforeAll: () => groups.only('500') }
    }
});
