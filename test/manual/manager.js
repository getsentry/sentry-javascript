'use strict';
var child_process = require('child_process');

var child;
function startChild() {
  console.log('starting child');
  child = child_process.spawn('node', ['express-patient.js']);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on('exit', function () {
    console.log('child exited');
    startChild();
  });
}

startChild();
