'use strict';
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var nodeRoot = process.argv[2];
var testRoot = path.join(nodeRoot, 'test/parallel');
var testFiles = fs.readdirSync(testRoot).filter(function (filename) {
  return filename.startsWith('test-http');
});

var failedTests = [];
var numSuccesses = 0;
testFiles.forEach(function (filename) {
  var testModulePath = path.join(testRoot, filename);
  try {
    child_process.execFileSync('node', ['--allow-natives-syntax', '--expose_gc', 'run-node-http-test.js', testModulePath], { stdio: 'ignore' });
    console.log('✓ ' + filename);
    numSuccesses++;
  } catch (e) {
    // non-zero exit code -> test failure
    failedTests.push(filename);
    console.log('X ' + filename + ' - error!');
  }
});

console.log('Finished, failures: ' + failedTests.length + ', successes: ' + numSuccesses);
console.log(failedTests);
console.log('Note: we are not worried about test-http-pipeline-flood.js failing.');
