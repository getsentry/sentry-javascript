import * as fs from 'fs';
import * as assert from 'assert/strict';

const packageJson = require('./package.json');
const nextjsVersion = packageJson.dependencies.next;

const buildStdout = fs.readFileSync('.tmp_build_stdout', 'utf-8');
const buildStderr = fs.readFileSync('.tmp_build_stderr', 'utf-8');

// Assert that there was no funky build time warning when we are on a stable (pinned) version
if (nextjsVersion !== 'latest' && nextjsVersion !== 'canary') {
  assert.doesNotMatch(buildStderr, /Import trace for requested module/); // This is Next.js/Webpack speech for "something is off"
}

// Assert that all static components stay static and all dynamic components stay dynamic
assert.match(buildStdout, /○ \/client-component/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[parameter\]/);
assert.match(buildStdout, /λ \/server-component/);
assert.match(buildStdout, /λ \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /λ \/server-component\/parameter\/\[parameter\]/);
