/** Regenerates `results/index.json` from the result files. Usage: node dist/runner/results-index.js */
import { writeIndex } from './results';

const index = writeIndex();
console.log(`results/index.json: ${index.results.length} results of ${index.releases.length} releases`);
