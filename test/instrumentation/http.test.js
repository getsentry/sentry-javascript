'use strict';
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

// running on pre-4.0 is hard, somewhat different test scheme
if (process.version < 'v4') process.exit(0);

var nodeRoot = process.argv[2];
var testRoot = path.join(nodeRoot, 'test/parallel');
var testFiles = fs.readdirSync(testRoot).filter(function (filename) {
  return filename.indexOf('test-http') === 0;
});

var failedTests = [];
var numSuccesses = 0;
testFiles.forEach(function (filename) {
  var testModulePath = path.join(testRoot, filename);
  try {
    child_process.execFileSync('node', [
      '--allow-natives-syntax',
      '--expose_gc',
      'run-node-http-test.js',
      testModulePath
    ], { stdio: 'ignore' });
    console.log('✓ ' + filename);
    numSuccesses++;
  } catch (e) {
    // non-zero exit code -> test failure
    failedTests.push(filename);
    console.log('X ' + filename + ' - error!');
  }
});

console.log('Finished, failures: ' + failedTests.length + ', successes: ' + numSuccesses);

// pipeline-flood is a harness issue with how it expects argvs
// header response splitting is something about becoming more strict on allowed chars in headers
// not worried about either one; they also fail without our instrumentation
var knownFailures = [
  'test-http-pipeline-flood.js',
  'test-http-header-response-splitting.js'
];

var didPass = failedTests.every(function (filename) {
  return knownFailures.indexOf(filename) !== -1;
});
if (!didPass) {
  console.log('Some unexpected failures, failing...');
  process.exit(1);
} else {
  console.log('All failures were known/expected, passing...');
  process.exit(0);
}
