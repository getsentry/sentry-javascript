import path from 'path';
import { Worker } from 'worker_threads';

const __dirname = new URL('.', import.meta.url).pathname;

function runJob() {
  const worker = new Worker(path.join(__dirname, 'job.js'));
  return new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code) reject(new Error(`Worker exited with code ${code}`));
      else resolve();
    });
  });
}

await runJob();
