'use strict';

var path = require('path');
var child_process = require('child_process');

var child;

var serverPath = path.join(__dirname, 'express-patient.js');

function startChild() {
  console.log('starting child');
  child = child_process.spawn('node', [serverPath]);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on('exit', function () {
    console.log('child exited');
    startChild();
  });
}

startChild();
