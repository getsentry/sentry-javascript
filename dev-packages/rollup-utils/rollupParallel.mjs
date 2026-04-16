/* eslint-disable no-console */

/**
 * Runs rollup builds in parallel for configs that export an array.
 * Usage: node rollupParallel.mjs <config-path>
 */
import { availableParallelism } from 'os';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { rollup } from 'rollup';

const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: node rollupParallel.mjs <config-path>');
  process.exit(1);
}

const { default: configs } = await import(pathToFileURL(resolve(configPath)).href);
const concurrency = availableParallelism();
const queue = [...configs];
let done = 0;

async function worker() {
  while (queue.length > 0) {
    const config = queue.shift();
    const bundle = await rollup({ ...config, onwarn: console.warn });
    await bundle.write(config.output);
    await bundle.close();
    done++;
    process.stdout.write(`\r  [${done}/${configs.length}] builds completed`);
  }
}

console.log(`Running ${configs.length} rollup builds (concurrency: ${concurrency})...`);
await Promise.all(Array.from({ length: concurrency }, worker));
console.log('\nDone.');
