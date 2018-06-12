'use strict';
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var nodeRoot = process.argv[2];
var testRoot = path.join(nodeRoot, 'test/parallel');
var testFiles = fs.readdirSync(testRoot).filter(function (filename) {
  return filename.indexOf('test-http') === 0;
});

var defaultFlags = [
  '--allow-natives-syntax',
  '--expose-gc',
  '--expose-internals'
];

if (process.version >= 'v8') defaultFlags.push('--expose-http2');

var failedTests = [];
var numSuccesses = 0;
testFiles.forEach(function (filename) {
  var testModulePath = path.join(testRoot, filename);
  var singleTestFlags = defaultFlags.concat([
    'run-node-http-test.js',
    testModulePath
  ]);

  // this is the only test, that actually asserts the lack of http2 flag
  // therefore we have to remove it from the process we are about to run
  if (filename === 'test-http2-noflag.js') {
    singleTestFlags = singleTestFlags.filter(function (flag) {
      return flag !== '--expose-http2';
    });
  }

  try {
    child_process.execFileSync('node', singleTestFlags, { stdio: 'ignore' });
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
