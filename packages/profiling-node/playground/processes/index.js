const process = require('process');
const path = require('path');

const { spawn, fork } = require('child_process');
const { Worker } = require('node:worker_threads');
const { threadId } = require('worker_threads');

console.log('process.js pid/tid:', process.pid, threadId);

const spawnProcess = spawn('node', [path.resolve(__dirname, 'process.spawn.js')]);
spawnProcess.stdout.on('data', (data) => {
  console.log(`process.spawn.js pid: ${data}`);
});

fork(path.resolve(__dirname, 'process.fork.js'));
new Worker(path.resolve(__dirname, 'process.worker.js'));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await wait(500);
})();
