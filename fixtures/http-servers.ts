/**
 * The applications of the `app` suites of the HTTP adapters: the same three routes served by AxiSpark.js (with the
 * Express or the Fastify adapter) and by Express or Fastify alone, on a random port of the loopback interface.
 */
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { IsEmail, IsInt, IsString, Max, Min, validate } from 'class-validator';
import { Pipe, ValidateSchema } from '@axisparkjs/engine';
import { Body, Controller, FileUpload, Get, HTTP_ADAPTER, HttpPlugin, Path, Post, UploadedFile, type HttpPluginOptions } from '@axisparkjs/http';
import type { AxiSparkCore } from '@axisparkjs/core';
import { createApp } from './app';

export class CreateItem {
    @IsString()
    name: string;

    @IsEmail()
    owner: string;

    @IsInt()
    @Min(0)
    @Max(1000)
    quantity: number;
}

@Controller('items')
export class ItemsController {
    @Get(':id')
    get(@Path('id') id: string) {
        return { id, name: 'Item' };
    }

    @Post()
    create(@Body() @Pipe(ValidateSchema()) item: CreateItem) {
        return { id: '1', ...item };
    }

    @Post('upload')
    @FileUpload({ maxFileSize: 1024 * 1024 })
    upload(@UploadedFile('file') file: UploadedFile) {
        return { name: file.originalName, size: file.size };
    }
}

export const ITEM = { name: 'Item', owner: 'ada@example.com', quantity: 3 };
export const FILE = Buffer.alloc(4096, 'a');

const BOUNDARY = '----axisparkbench';
/** A multipart body with one file of 4 KiB, built once. */
export const MULTIPART = Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="file.txt"\r\nContent-Type: text/plain\r\n\r\n`),
    FILE,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`)
]);
export const MULTIPART_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

export async function validItem(body: unknown): Promise<CreateItem | undefined> {
    const item = Object.assign(Object.create(CreateItem.prototype), body) as CreateItem;
    return (await validate(item)).length ? undefined : item;
}

export interface RunningServer {
    url: string;
    close(): Promise<void>;
}

/** Starts an AxiSpark.js application with the HTTP plugin on a random port. */
export async function startAxiSpark(options: HttpPluginOptions): Promise<RunningServer & { app: AxiSparkCore }> {
    const app = createApp({ plugins: [[HttpPlugin, { ...options, port: 0, basePath: '/api', fileUpload: true } as HttpPluginOptions]] });
    await app.init();
    await app.run();
    const adapter = (await app.get(HTTP_ADAPTER)) as { getHttpServer(): Server };
    const { port } = adapter.getHttpServer().address() as AddressInfo;
    return { app, url: `http://127.0.0.1:${port}/api`, close: () => app.destroy() };
}

export function urlOf(server: Server, base = ''): string {
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}${base}`;
}

export interface Client {
    get(): Promise<void>;
    post(): Promise<void>;
    upload(): Promise<void>;
}

/**
 * Requests of the measurement, sent one after another over one keep-alive connection. The client is `node:http`:
 * the global `fetch` adds more than a millisecond per request, which would hide the cost of the servers.
 */
export function client(base: string): Client & { close(): void } {
    const url = new URL(base);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const request = (method: string, path: string, headers: Record<string, string | number> = {}, body?: Buffer | string) =>
        new Promise<void>((resolve, reject) => {
            const req = http.request({ host: url.hostname, port: url.port, path: `${url.pathname}${path}`, method, headers, agent }, (res) => {
                res.resume();
                res.on('end', () => (res.statusCode && res.statusCode < 300 ? resolve() : reject(new Error(`HTTP ${res.statusCode} from ${method} ${path}`))));
                res.on('error', reject);
            });
            req.on('error', reject);
            req.end(body);
        });
    const json = JSON.stringify(ITEM);
    return {
        get: () => request('GET', '/items/42'),
        post: () => request('POST', '/items', { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) }, json),
        upload: () => request('POST', '/items/upload', { 'content-type': MULTIPART_TYPE, 'content-length': MULTIPART.length }, MULTIPART),
        close: () => agent.destroy()
    };
}

/** Checks that both servers answer the three requests before measuring them. */
export async function checkClients(...clients: Client[]): Promise<void> {
    for (const c of clients) {
        await c.get();
        await c.post();
        await c.upload();
    }
}
