import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { HTTP_ADAPTER, HttpPlugin, type HttpPluginOptions } from '@axisparkjs/http';
import { HttpPluginOptionsFactory as ExpressOptions } from '@axisparkjs/http-express';
import { HttpPluginOptionsFactory as FastifyOptions } from '@axisparkjs/http-fastify';
import { createApp } from '../../fixtures/app';
import '../../fixtures/samples/todo-crud/controller';
import { defineSuite } from '../../runner/define-suite';
import type { AxiSparkCore } from '@axisparkjs/core';

interface TodoClient {
    request(method: string, path: string, body?: unknown): Promise<void>;
    close(): void;
}

function todoClient(port: number): TodoClient {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    return {
        request: (method, path, body) =>
            new Promise((resolve, reject) => {
                const payload = body === undefined ? undefined : JSON.stringify(body);
                const headers = payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {};
                const req = http.request({ host: '127.0.0.1', port, path: `/api${path}`, method, headers, agent }, (res) => {
                    res.resume();
                    res.on('end', () => (res.statusCode && res.statusCode < 300 ? resolve() : reject(new Error(`HTTP ${res.statusCode} from ${method} ${path}`))));
                });
                req.on('error', reject);
                req.end(payload);
            }),
        close: () => agent.destroy()
    };
}

async function start(options: HttpPluginOptions): Promise<{ app: AxiSparkCore; client: TodoClient }> {
    const app = createApp({ name: 'TODO Crud', plugins: [[HttpPlugin, { ...options, basePath: '/api', port: 0 } as HttpPluginOptions]] });
    await app.init();
    await app.run();
    const server = ((await app.get(HTTP_ADAPTER)) as { getHttpServer(): Server }).getHttpServer();
    const client = todoClient((server.address() as AddressInfo).port);
    // Ten todos: the list and the updates work on a table with data.
    for (let index = 0; index < 10; index++) await client.request('POST', '/todos', { task: `Task ${index}` });
    return { app, client };
}

interface Ctx {
    express: { app: AxiSparkCore; client: TodoClient };
    fastify: { app: AxiSparkCore; client: TodoClient };
}

const tasks = (adapter: 'express' | 'fastify') => ({
    [`${adapter}-list`]: (ctx: Ctx) => ctx[adapter].client.request('GET', '/todos'),
    [`${adapter}-get`]: (ctx: Ctx) => ctx[adapter].client.request('GET', '/todos/5'),
    [`${adapter}-update`]: (ctx: Ctx) => ctx[adapter].client.request('PUT', '/todos/5', { task: 'Updated' })
});

export default defineSuite<Ctx>({
    package: 'scenarios',
    id: 'app.todo-crud',
    version: 1,
    tier: 'app',
    description: 'Latency per request of the todo-crud sample on loopback, with the Express and the Fastify adapters.',
    setup: async () => ({ express: await start(ExpressOptions.create()), fastify: await start(FastifyOptions.create()) }),
    tasks: { ...tasks('express'), ...tasks('fastify') },
    teardown: async (ctx) => {
        for (const { app, client } of [ctx.express, ctx.fastify]) {
            client.close();
            await app.destroy();
        }
    }
});
