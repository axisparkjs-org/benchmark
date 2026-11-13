import { WebSocket, WebSocketEvent, WsAck, WsData } from '@axisparkjs/websocket';
import { createApp } from '../../fixtures/app';
import { MemoryConnection, memoryWebSocketAdapter, memoryWebSocketPlugin, type MemoryWebSocketAdapter } from '../../fixtures/websocket';
import { defineSuite } from '../../runner/define-suite';

@WebSocket('/chat')
class ChatWebSocket {
    @WebSocketEvent('message')
    onMessage(@WsData() data: { text: string }) {
        return { received: data.text };
    }

    @WebSocketEvent('ping')
    onPing(@WsAck() ack: (response: unknown) => void) {
        ack({ pong: true });
    }

    @WebSocketEvent(/^room:.+$/)
    onRoom(@WsData() data: unknown) {
        return { room: data };
    }
}
void ChatWebSocket;

const noop = () => {};

interface Ctx {
    app: { destroy(): Promise<void> };
    ws: MemoryWebSocketAdapter;
    connection: MemoryConnection;
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/websocket',
    id: 'websocket.dispatch',
    version: 1,
    tier: 'micro',
    description: 'Dispatches a message to a handler through the engine pipeline, without network.',
    setup: async () => {
        const app = createApp({ plugins: [memoryWebSocketPlugin()] });
        await app.init();
        await app.run();
        const ws = await memoryWebSocketAdapter(app);
        const connection = new MemoryConnection('c-1', '/chat');
        // The value returned by a handler is sent back as the acknowledgement of the message.
        let answer: unknown;
        await ws.dispatch(connection, 'message', { text: 'hello' }, (response) => (answer = response));
        if ((answer as { received?: string })?.received !== 'hello') throw new Error(`The handler did not answer the message: ${JSON.stringify(answer)}`);
        answer = undefined;
        await ws.dispatch(connection, 'room:lobby', 'lobby', (response) => (answer = response));
        if (!answer) throw new Error('The regular expression handler did not answer the message');
        return { app, ws, connection };
    },
    tasks: {
        message: (ctx) => ctx.ws.dispatch(ctx.connection, 'message', { text: 'hello' }, noop),
        'explicit-ack': (ctx) => ctx.ws.dispatch(ctx.connection, 'ping', undefined, noop),
        'regex-event': (ctx) => ctx.ws.dispatch(ctx.connection, 'room:lobby', 'lobby', noop)
    },
    teardown: (ctx) => ctx.app.destroy()
});
