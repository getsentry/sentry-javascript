const process = require('process');
const { threadId } = require('node:worker_threads');

console.log('process.worker.js pid/tid', `${process.pid}/${threadId}`);
