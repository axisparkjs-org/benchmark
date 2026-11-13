import { Controller, Get, Header, Path, VersionType } from '@axisparkjs/http';
import { ClassGroups, createApp } from '../../fixtures/app';
import { syntheticControllers } from '../../fixtures/controllers';
import { expectStatus, memoryAdapter, memoryHttpPlugin, type MemoryHttpAdapter } from '../../fixtures/http';
import { defineSuite } from '../../runner/define-suite';

@Controller('items')
class VersionedController {
    @Get({ path: ':id', version: '1' })
    v1(@Path('id') id: string) {
        return { id, version: 1 };
    }

    @Get({ path: ':id', version: '2' })
    v2(@Path('id') id: string, @Header('x-trace') trace: string) {
        return { id, version: 2, trace };
    }
}

const groups = new ClassGroups();
const routes10 = syntheticControllers(10);
const routes500 = syntheticControllers(500);
groups.add('10', routes10.controllers);
groups.add('500', routes500.controllers);
groups.add('versioned', [VersionedController]);

async function start(group: string, options: Parameters<typeof memoryHttpPlugin>[0] = {}) {
    groups.only(group);
    const app = createApp({ plugins: [memoryHttpPlugin(options)] });
    await app.init();
    await app.run();
    return { app, adapter: await memoryAdapter(app) };
}

interface Ctx {
    apps: { destroy(): Promise<void> }[];
    r10: MemoryHttpAdapter;
    r500: MemoryHttpAdapter;
    header: MemoryHttpAdapter;
    uri: MemoryHttpAdapter;
}

const V2 = { 'x-api-version': '2', 'x-trace': 'bench' };

export default defineSuite<Ctx>({
    package: '@axisparkjs/http',
    id: 'http.dispatch',
    version: 1,
    tier: 'micro',
    description: 'Runs a GET request through the HTTP pipeline without network, with versioning by header and by URI.',
    setup: async () => {
        const r10 = await start('10');
        const r500 = await start('500');
        const header = await start('versioned', { version: true, versionOptions: { type: VersionType.Header, header: 'x-api-version' } });
        const uri = await start('versioned', { version: true, versionOptions: { type: VersionType.Uri } });

        await expectStatus(r10.adapter.dispatch('GET', `/api${routes10.middle}`), 200);
        await expectStatus(r500.adapter.dispatch('GET', `/api${routes500.middle}`), 200);
        const byHeader = await expectStatus(header.adapter.dispatch('GET', '/api/items/42', V2), 200);
        if ((byHeader.body as { version: number }).version !== 2) throw new Error('The header version did not select v2');
        const byUri = await expectStatus(uri.adapter.dispatch('GET', '/api/v2/items/42', { 'x-trace': 'bench' }), 200);
        if ((byUri.body as { version: number }).version !== 2) throw new Error('The URI version did not select v2');

        return { apps: [r10.app, r500.app, header.app, uri.app], r10: r10.adapter, r500: r500.adapter, header: header.adapter, uri: uri.adapter };
    },
    tasks: {
        'get-10-routes': (ctx) => ctx.r10.dispatch('GET', `/api${routes10.middle}`),
        'get-500-routes': (ctx) => ctx.r500.dispatch('GET', `/api${routes500.middle}`),
        'version-header': (ctx) => ctx.header.dispatch('GET', '/api/items/42', V2),
        'version-uri': (ctx) => ctx.uri.dispatch('GET', '/api/v2/items/42', { 'x-trace': 'bench' })
    },
    teardown: async (ctx) => {
        for (const app of ctx.apps) await app.destroy();
    }
});
