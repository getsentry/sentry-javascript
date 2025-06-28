import { Worker } from 'node:worker_threads';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const workerPath = path.join(__dirname, 'worker-block.mjs');

const thread = new Worker(workerPath, { stdout: 'inherit' });
thread.unref();

setInterval(() => {
  // This keeps the main thread alive to allow the worker to run indefinitely
}, 1000);
