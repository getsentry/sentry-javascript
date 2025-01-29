import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert/strict';

const packageJson = require('./package.json');
const nextjsVersion = packageJson.dependencies.next;

const buildStdout = fs.readFileSync('.tmp_build_stdout', 'utf-8');
const buildStderr = fs.readFileSync('.tmp_build_stderr', 'utf-8');

// Assert that there was no funky build time warning when we are on a stable (pinned) version
if (nextjsVersion !== 'latest' && !nextjsVersion.includes('-canary') && !nextjsVersion.includes('-rc')) {
  assert.doesNotMatch(buildStderr, /Import trace for requested module/, `Build warning in output:\n${buildStderr}`); // This is Next.js/Webpack speech for "something is off"
}

// Assert that all static components stay static and all dynamic components stay dynamic
assert.match(buildStdout, /○ \/client-component/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[parameter\]/);
assert.match(buildStdout, /(λ|ƒ) \/server-component/);
assert.match(buildStdout, /(λ|ƒ) \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /(λ|ƒ) \/server-component\/parameter\/\[parameter\]/);

// Read the contents of the directory
const files = fs.readdirSync(path.join(process.cwd(), '.next', 'static'));
const mapFiles = files.filter(file => path.extname(file) === '.map');
if (mapFiles.length > 0) {
  throw new Error('Client bundle .map files found even though `sourcemaps.deleteSourcemapsAfterUpload` option is set!');
}

export {};
