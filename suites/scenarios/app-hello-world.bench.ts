import { createApp } from '../../fixtures/app';
import { HelloWorldPlugin } from '../../fixtures/samples/hello-world/plugin';
import { defineSuite } from '../../runner/define-suite';

async function lifecycle() {
    const app = createApp({ name: 'Hello World App', plugins: [HelloWorldPlugin] });
    await app.init();
    await app.run();
    await app.destroy();
}

export default defineSuite({
    package: 'scenarios',
    id: 'app.hello-world',
    version: 1,
    tier: 'app',
    description: 'init → run → destroy of the hello-world sample.',
    tasks: {
        lifecycle
    },
    memory: {
        lifecycle: async () => {
            const app = createApp({ name: 'Hello World App', plugins: [HelloWorldPlugin] });
            await app.init();
            await app.run();
            return () => app.destroy();
        }
    }
});
