const path = require('path');
const { Worker } = require('worker_threads');

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

runJob()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Job completed successfully');
  })
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error('caught', err);
  });
