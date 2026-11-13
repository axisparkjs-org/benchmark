/**
 * An HTTP adapter without network for the `micro` suites of `@axisparkjs/http`: it implements the same `HttpAdapter`
 * contract as the Express and Fastify adapters and dispatches requests in memory, so the measurement is the cost of
 * the AxiSpark.js pipeline (route group, host, version, parameters, pipes, result) and not the cost of a server.
 */
import type { HttpServer } from '@axisparkjs/common';
import { Injectable } from '@axisparkjs/di';
import { HttpPlugin, HTTP_ADAPTER, type HttpAdapter, type HttpPluginOptions, type HttpRequest, type HttpResponse, type RouteDefinition } from '@axisparkjs/http';
import { HttpPluginOptionsFactory } from '@axisparkjs/http-fastify';
import type { AxiSparkCore } from '@axisparkjs/core';

export class MemoryRequest implements HttpRequest {
    readonly url: string;
    readonly ip = '127.0.0.1';
    readonly cookies: Record<string, string | undefined> = {};

    constructor(
        readonly method: string,
        readonly path: string,
        readonly params: Record<string, string>,
        readonly headers: Record<string, string> = {},
        readonly query: Record<string, string> = {},
        readonly body: unknown = undefined
    ) {
        this.url = path;
    }

    getCookie(name: string): string | undefined {
        return this.cookies[name];
    }

    getHeader(name: string): string | undefined {
        return this.headers[name.toLowerCase()];
    }
}

export class MemoryResponse implements HttpResponse {
    statusCode = 200;
    headers: Record<string, string> = {};
    body: unknown;
    private committed = false;

    status(code: number): this {
        this.statusCode = code;
        return this;
    }

    header(name: string, value: string): this {
        this.headers[name.toLowerCase()] = value;
        return this;
    }

    cookie(): this {
        return this;
    }

    clearCookie(): this {
        return this;
    }

    json(body?: unknown): void {
        this.body = body;
        this.committed = true;
    }

    send(body?: unknown): void {
        this.body = body;
        this.committed = true;
    }

    file(filePath: string): void {
        this.body = filePath;
        this.committed = true;
    }

    stream(stream: NodeJS.ReadableStream): void {
        this.body = stream;
        this.committed = true;
    }

    end(): void {
        this.committed = true;
    }

    isCommitted(): boolean {
        return this.committed;
    }
}

interface CompiledRoute {
    method: string;
    pattern: RegExp;
    names: string[];
    route: RouteDefinition;
}

@Injectable()
export class MemoryHttpAdapter implements HttpAdapter {
    private readonly routes: RouteDefinition[] = [];
    private readonly staticRoutes = new Map<string, RouteDefinition>();
    /** Routes with parameters, by method and static prefix (`GET /api/users`), so the lookup does not depend on the table size. */
    private readonly dynamicRoutes = new Map<string, CompiledRoute[]>();

    registerRoutes(routes: readonly RouteDefinition[]): void {
        this.routes.push(...routes);
        for (const route of routes) {
            const method = route.httpMethod.toUpperCase();
            if (!route.path.includes(':')) {
                this.staticRoutes.set(`${method} ${route.path}`, route);
                continue;
            }
            const names: string[] = [];
            const source = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, name: string) => {
                names.push(name);
                return '([^/]+)';
            });
            const prefix = MemoryHttpAdapter.staticPrefix(route.path);
            const key = `${method} ${prefix}`;
            const group = this.dynamicRoutes.get(key) ?? [];
            group.push({ method, pattern: new RegExp(`^${source}$`), names, route });
            this.dynamicRoutes.set(key, group);
        }
    }

    private static staticPrefix(path: string): string {
        const segments = path.split('/');
        const index = segments.findIndex((segment) => segment.includes(':'));
        return segments.slice(0, index).join('/');
    }

    getRegisteredRoutes(): readonly RouteDefinition[] {
        return this.routes;
    }

    getHttpServer(): HttpServer {
        throw new Error('The memory adapter has no HTTP server');
    }

    start(): void {}

    stop(): void {}

    /** Finds the route like a router does and runs it through the AxiSpark.js pipeline. */
    async dispatch(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<MemoryResponse> {
        let route = this.staticRoutes.get(`${method} ${path}`);
        const params: Record<string, string> = {};
        if (!route) {
            const segments = path.split('/');
            search: for (let length = segments.length - 1; length >= 1; length--) {
                for (const candidate of this.dynamicRoutes.get(`${method} ${segments.slice(0, length).join('/')}`) ?? []) {
                    const match = candidate.pattern.exec(path);
                    if (!match) continue;
                    candidate.names.forEach((name, index) => (params[name] = decodeURIComponent(match[index + 1])));
                    route = candidate.route;
                    break search;
                }
            }
        }
        const response = new MemoryResponse();
        if (!route) return response.status(404);
        await route.handler({ request: new MemoryRequest(method, path, params, headers, {}, body), response, session: undefined });
        return response;
    }
}

/** Options of the HTTP plugin with the default values of an adapter and the memory adapter. */
export function memoryHttpOptions(options: Partial<HttpPluginOptions> = {}): HttpPluginOptions {
    return { ...HttpPluginOptionsFactory.create({ basePath: '/api' }), ...options, adapter: MemoryHttpAdapter };
}

export const memoryHttpPlugin = (options: Partial<HttpPluginOptions> = {}): [typeof HttpPlugin, HttpPluginOptions] => [HttpPlugin, memoryHttpOptions(options)];

export async function memoryAdapter(app: AxiSparkCore): Promise<MemoryHttpAdapter> {
    return (await app.get(HTTP_ADAPTER)) as MemoryHttpAdapter;
}

/** Fails the suite at setup if a request does not return the expected status. */
export async function expectStatus(response: Promise<MemoryResponse>, status: number): Promise<MemoryResponse> {
    const result = await response;
    if (result.statusCode !== status) throw new Error(`Expected HTTP ${status}, got ${result.statusCode}: ${JSON.stringify(result.body)}`);
    return result;
}
