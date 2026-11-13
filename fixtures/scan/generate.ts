/**
 * Generates the tree of files of the `boot.scan` scenario: `count` compiled modules in nested directories, each one
 * with an injectable service, like the files that the scanner discovers in an application.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../runner/paths';

export function generateTree(count: number, root = mkdtempSync(join(tmpdir(), `axispark-scan-${count}-`))): string {
    const di = JSON.stringify(require.resolve('@axisparkjs/di', { paths: [ROOT] }));
    for (let index = 0; index < count; index++) {
        const dir = join(root, `module-${Math.floor(index / 10)}`, index % 2 ? 'services' : 'controllers');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, `file-${index}.js`),
            `"use strict";
const { Injectable } = require(${di});
class Service${index} {
    handle(value) {
        return value + ${index};
    }
}
Injectable()(Service${index});
exports.Service${index} = Service${index};
`
        );
    }
    return root;
}
