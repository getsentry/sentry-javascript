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

var knownFailures = [
  'test-http-pipeline-flood.js'
];

var didPass = failedTests.every(function (filename) {
  return knownFailures.indexOf(filename) !== -1;
});
if (!didPass) {
  console.log('Some unexpected failures, failing...')
  process.exit(1);
} else {
  console.log('All failures were known/expected, passing...')
  process.exit(0);
}
