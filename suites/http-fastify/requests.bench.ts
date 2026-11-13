import multipart from '@fastify/multipart';
import fastify from 'fastify';
import { HttpPluginOptionsFactory } from '@axisparkjs/http-fastify';
import { checkClients, client, startAxiSpark, validItem, type Client, type RunningServer } from '../../fixtures/http-servers';
import { defineSuite } from '../../runner/define-suite';

/** The same routes with Fastify alone. */
async function rawFastify(): Promise<RunningServer> {
    const app = fastify();
    await app.register(multipart);
    app.get<{ Params: { id: string } }>('/api/items/:id', async (req) => ({ id: req.params.id, name: 'Item' }));
    app.post('/api/items', async (req, reply) => {
        const item = await validItem(req.body);
        if (!item) return reply.status(400).send({ error: 'Invalid item' });
        return { id: '1', ...item };
    });
    app.post('/api/items/upload', async (req) => {
        const file = await req.file({ limits: { fileSize: 1024 * 1024 } });
        const buffer = await file!.toBuffer();
        return { name: file!.filename, size: buffer.length };
    });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    return { url: `${address}/api`, close: () => app.close() };
}

interface Ctx {
    servers: RunningServer[];
    axispark: Client & { close(): void };
    raw: Client & { close(): void };
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/http-fastify',
    id: 'http-fastify.requests',
    version: 1,
    tier: 'app',
    description: 'Latency of a request on loopback: GET, POST with validation and a multipart upload of 4 KiB.',
    baseline: { get: 'raw-get', post: 'raw-post', upload: 'raw-upload' },
    setup: async () => {
        const axispark = await startAxiSpark(HttpPluginOptionsFactory.create());
        const raw = await rawFastify();
        const ctx = { servers: [axispark, raw], axispark: client(axispark.url), raw: client(raw.url) };
        await checkClients(ctx.axispark, ctx.raw);
        return ctx;
    },
    tasks: {
        get: (ctx) => ctx.axispark.get(),
        post: (ctx) => ctx.axispark.post(),
        upload: (ctx) => ctx.axispark.upload(),
        'raw-get': (ctx) => ctx.raw.get(),
        'raw-post': (ctx) => ctx.raw.post(),
        'raw-upload': (ctx) => ctx.raw.upload()
    },
    teardown: async (ctx) => {
        ctx.axispark.close();
        ctx.raw.close();
        for (const server of ctx.servers) await server.close();
    }
});
