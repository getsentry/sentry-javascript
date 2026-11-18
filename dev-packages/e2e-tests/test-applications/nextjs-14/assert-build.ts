import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert/strict';
import { findSourceMapFiles } from '@sentry-internal/test-utils';

const buildStdout = fs.readFileSync('.tmp_build_stdout', 'utf-8');
const buildStderr = fs.readFileSync('.tmp_build_stderr', 'utf-8');

assert.doesNotMatch(
  buildStderr,
  /Import trace for requested module/, // This is Next.js/Webpack speech for "something is off"
  `The E2E tests detected a build warning in the Next.js build output:\n\n--------------\n\n${buildStderr}\n\n--------------\n\n`,
);

// Assert that all static components stay static and all dynamic components stay dynamic
assert.match(buildStdout, /○ \/client-component/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[parameter\]/);
assert.match(buildStdout, /(λ|ƒ) \/server-component/);
assert.match(buildStdout, /(λ|ƒ) \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /(λ|ƒ) \/server-component\/parameter\/\[parameter\]/);

assert.deepEqual(
  findSourceMapFiles({ outputDir: path.join('.next', 'static') }),
  [],
  'Client bundle .map files found even though `sourcemaps.deleteSourcemapsAfterUpload` option is set!',
);
