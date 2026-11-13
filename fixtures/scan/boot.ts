/**
 * Boots an application that scans a directory and exits: a cold start of `node`, like an application starts.
 * Usage: node --expose-gc dist/fixtures/scan/boot.js <base path> [file-system|null]
 */
import 'reflect-metadata';
import { createApp } from '../app';

const [basePath, scan = 'file-system'] = process.argv.slice(2);

(async () => {
    const app = createApp({ basePath, scan: scan as 'file-system' | 'null' });
    await app.init();
    await app.run();
    await app.destroy();
})().then(
    () => process.exit(0),
    (error) => {
        console.error(error);
        process.exit(1);
    }
);
