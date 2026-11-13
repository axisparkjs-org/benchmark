/**
 * A WebSocket adapter without network for the `micro` suite of `@axisparkjs/websocket`. It implements the
 * `WebSocketAdapter` contract of the Socket.IO adapter and dispatches the messages in memory.
 */
import { Injectable } from '@axisparkjs/di';
import { WEBSOCKET_ADAPTER, WebSocketPlugin, type WebSocketAdapter, type WebSocketConnection, type WebSocketEventDefinition, type WebSocketPluginOptions } from '@axisparkjs/websocket';
import { WebSocketPluginOptionsFactory } from '@axisparkjs/websocket-socketio';
import type { AxiSparkCore } from '@axisparkjs/core';

export class MemoryConnection implements WebSocketConnection {
    readonly remoteAddress = '127.0.0.1';
    readonly rooms: string[] = [];
    readonly connected = true;
    emitted = 0;
    last: unknown;

    constructor(
        public id: string,
        public namespace: string | undefined
    ) {}

    emit(_event: string, data?: unknown): void {
        this.emitted++;
        this.last = data;
    }

    join(room: string): void {
        if (!this.rooms.includes(room)) this.rooms.push(room);
    }

    leave(room: string): void {
        const index = this.rooms.indexOf(room);
        if (index >= 0) this.rooms.splice(index, 1);
    }

    broadcast(): void {}

    close(): void {}
}

@Injectable()
export class MemoryWebSocketAdapter implements WebSocketAdapter {
    private readonly events: WebSocketEventDefinition[] = [];
    private readonly byName = new Map<string, WebSocketEventDefinition>();
    private readonly regex: WebSocketEventDefinition[] = [];

    registerEvents(events: readonly WebSocketEventDefinition[]): void {
        this.events.push(...events);
        for (const event of events) {
            if (typeof event.event === 'string') this.byName.set(`${event.namespace}#${event.event}`, event);
            else this.regex.push(event);
        }
    }

    getRegisteredEvents(): readonly WebSocketEventDefinition[] {
        return this.events;
    }

    start(): void {}

    stop(): void {}

    /** Delivers a message like the Socket.IO adapter: by event name, then by the regular expressions. */
    async dispatch(connection: MemoryConnection, event: string, data: unknown, ack?: (response?: unknown) => void): Promise<void> {
        const namespace = connection.namespace ?? '/';
        const definition = this.byName.get(`${namespace}#${event}`);
        if (definition) {
            await definition.handler({ message: { event, data, ack }, connection });
            return;
        }
        for (const candidate of this.regex) {
            if (candidate.namespace === namespace && (candidate.event as RegExp).test(event)) {
                await candidate.handler({ message: { event, data, ack }, connection });
            }
        }
    }
}

export function memoryWebSocketPlugin(options: Partial<WebSocketPluginOptions> = {}): [typeof WebSocketPlugin, WebSocketPluginOptions] {
    return [WebSocketPlugin, { ...WebSocketPluginOptionsFactory.create({ useHttpPluginServer: false }), ...options, adapter: MemoryWebSocketAdapter }];
}

export async function memoryWebSocketAdapter(app: AxiSparkCore): Promise<MemoryWebSocketAdapter> {
    return (await app.get(WEBSOCKET_ADAPTER)) as MemoryWebSocketAdapter;
}
