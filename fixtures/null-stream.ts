import { Writable } from 'node:stream';

/** A stream that discards what it receives, to measure the logger without the cost of the terminal or a file. */
export function nullStream(): Writable {
    return new Writable({
        write(_chunk, _encoding, callback) {
            callback();
        }
    });
}
