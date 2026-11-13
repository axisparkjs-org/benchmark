import type { Server } from 'node:http';
import Busboy from 'busboy';
import express from 'express';
import { HttpPluginOptionsFactory } from '@axisparkjs/http-express';
import { checkClients, client, startAxiSpark, urlOf, validItem, type Client, type RunningServer } from '../../fixtures/http-servers';
import { defineSuite } from '../../runner/define-suite';

/** The same routes with Express alone. */
function rawExpress(): Promise<Server> {
    const app = express();
    app.use(express.json());
    app.get('/api/items/:id', (req, res) => {
        res.json({ id: req.params.id, name: 'Item' });
    });
    app.post('/api/items', async (req, res) => {
        const item = await validItem(req.body);
        if (!item) return void res.status(400).json({ error: 'Invalid item' });
        res.json({ id: '1', ...item });
    });
    app.post('/api/items/upload', (req, res) => {
        const busboy = Busboy({ headers: req.headers, limits: { fileSize: 1024 * 1024 } });
        let result: { name: string; size: number } | undefined;
        busboy.on('file', (_field, stream, info) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => (result = { name: info.filename, size: Buffer.concat(chunks).length }));
        });
        busboy.on('close', () => res.json(result));
        req.pipe(busboy);
    });
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

interface Ctx {
    servers: RunningServer[];
    axispark: Client & { close(): void };
    raw: Client & { close(): void };
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/http-express',
    id: 'http-express.requests',
    version: 1,
    tier: 'app',
    description: 'Latency of a request on loopback: GET, POST with validation and a multipart upload of 4 KiB.',
    baseline: { get: 'raw-get', post: 'raw-post', upload: 'raw-upload' },
    setup: async () => {
        const axispark = await startAxiSpark(HttpPluginOptionsFactory.create());
        const server = await rawExpress();
        const raw: RunningServer = { url: urlOf(server, '/api'), close: () => new Promise((resolve) => server.close(() => resolve())) };
        server.keepAliveTimeout = 60_000;
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
