import { createServer, type AddressInfo } from 'node:net';

/** A free port of the loopback interface, for adapters that do not accept port 0. */
export function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            server.close(() => resolve(port));
        });
    });
}
