const process = require('process');
const { threadId } = require('node:worker_threads');

console.log(`${process.pid}/${threadId}`);
