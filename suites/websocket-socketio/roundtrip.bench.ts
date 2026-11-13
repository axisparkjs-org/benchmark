import { Server as SocketServer } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import { WebSocket, WebSocketEvent, WebSocketPlugin, WsData } from '@axisparkjs/websocket';
import { WebSocketPluginOptionsFactory } from '@axisparkjs/websocket-socketio';
import { createApp } from '../../fixtures/app';
import { freePort } from '../../fixtures/ports';
import { defineSuite } from '../../runner/define-suite';

@WebSocket('/chat')
class ChatWebSocket {
    @WebSocketEvent('message')
    onMessage(@WsData() data: { text: string }) {
        return { received: data.text };
    }
}
void ChatWebSocket;

const PATH = '/websocket';

function connect(port: number, path = '/socket.io'): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(`http://127.0.0.1:${port}/chat`, { path, transports: ['websocket'], reconnection: false });
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
    });
}

interface Ctx {
    app: { destroy(): Promise<void> };
    raw: SocketServer;
    axispark: Socket;
    client: Socket;
}

const MESSAGE = { text: 'hello' };

export default defineSuite<Ctx>({
    package: '@axisparkjs/websocket-socketio',
    id: 'websocket-socketio.roundtrip',
    version: 1,
    tier: 'app',
    description: 'Round trip of a message with acknowledgement between a Socket.IO client and the server, on loopback.',
    baseline: 'raw-roundtrip',
    setup: async () => {
        const port = await freePort();
        const app = createApp({ plugins: [[WebSocketPlugin, WebSocketPluginOptionsFactory.create({ useHttpPluginServer: false, port, path: PATH })]] });
        await app.init();
        await app.run();

        // The same handler with Socket.IO alone.
        const rawPort = await freePort();
        const raw = new SocketServer(rawPort, { path: PATH });
        raw.of('/chat').on('connection', (socket) => {
            socket.on('message', (data: { text: string }, ack: (response: unknown) => void) => ack({ received: data.text }));
        });

        const ctx = { app, raw, axispark: await connect(port, PATH), client: await connect(rawPort, PATH) };
        for (const socket of [ctx.axispark, ctx.client]) {
            const answer = (await socket.timeout(5000).emitWithAck('message', MESSAGE)) as { received?: string };
            if (answer?.received !== 'hello') throw new Error(`Unexpected answer: ${JSON.stringify(answer)}`);
        }
        return ctx;
    },
    tasks: {
        roundtrip: (ctx) => ctx.axispark.emitWithAck('message', MESSAGE),
        'raw-roundtrip': (ctx) => ctx.client.emitWithAck('message', MESSAGE)
    },
    teardown: async (ctx) => {
        ctx.axispark.close();
        ctx.client.close();
        await new Promise<void>((resolve) => ctx.raw.close(() => resolve()));
        await ctx.app.destroy();
    }
});
