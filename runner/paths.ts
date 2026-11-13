import { basename, dirname, join, resolve } from 'node:path';

/** Root of the repository. The compiled files live in `dist/runner`, the sources in `runner`. */
export const ROOT = basename(dirname(__dirname)) === 'dist' ? resolve(__dirname, '../..') : resolve(__dirname, '..');
export const RESULTS_DIR = join(ROOT, 'results');
export const INDEX_FILE = join(RESULTS_DIR, 'index.json');
/** Compiled suites. */
export const SUITES_DIR = join(ROOT, 'dist', 'suites');
/** Results that are not saved in `results/`: snapshots and quick runs. */
export const OUT_DIR = join(ROOT, 'out');
