const { parentPort } = require('worker_threads');

const worker_waiting = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// You can do any heavy stuff here, in a synchronous way
// without blocking the "main thread"
parentPort.on('message', async function processingMessage(message) {
  await worker_waiting(2000);
  parentPort.postMessage('pong');
});
