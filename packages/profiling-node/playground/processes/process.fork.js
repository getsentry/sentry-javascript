const process = require('process');
const { threadId } = require('worker_threads');

console.log('process.fork pid/tid:', `${process.pid}/${threadId}`);
