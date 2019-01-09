const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const serverPath = path.join(__dirname, 'express-patient.js');
let child;

function generateLargeModule() {
  fs.writeFileSync(
    path.join(__dirname, 'large-module-dist.js'),
    fs
      .readFileSync(path.join(__dirname, 'large-module-src.js'))
      .toString()
      .replace('{{template}}', 'A'.repeat(5 * 1024 * 1024)),
  );
}

if (!fs.existsSync(path.join(__dirname, 'large-module-dist.js'))) {
  console.log('Missing large-module-dist.js file... generating...');
  generateLargeModule();
}

function startChild() {
  console.log('starting child');
  child = child_process.spawn('node', [serverPath]);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on('exit', function() {
    console.log('child exited');
    startChild();
  });
}

startChild();
