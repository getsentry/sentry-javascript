import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert/strict';
import { findSourceMapFiles, findSourceMappingUrlComments } from '@sentry-internal/test-utils';

const nextPackageJson = require('next/package.json');
const nextjsVersion = nextPackageJson.version;

const buildStdout = fs.readFileSync('.tmp_build_stdout', 'utf-8');
const buildStderr = fs.readFileSync('.tmp_build_stderr', 'utf-8');

const getLatestNextVersion = async () => {
  try {
    const response = await fetch('https://registry.npmjs.org/next/latest');
    const data = await response.json();
    return data.version as string;
  } catch {
    return '0.0.0';
  }
};

(async () => {
  // Assert that there was no funky build time warning when we are on a stable (pinned) version
  if (
    !nextjsVersion.includes('-canary') &&
    !nextjsVersion.includes('-rc') &&
    // If we install latest we cannot assert on "latest" because the package json will contain the actual version number
    nextjsVersion !== (await getLatestNextVersion())
  ) {
    assert.doesNotMatch(
      buildStderr,
      /Import trace for requested module/, // This is Next.js/Webpack speech for "something is off"
      `The E2E tests detected a build warning in the Next.js build output:\n\n--------------\n\n${buildStderr}\n\n--------------\n\n`,
    );
  }

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
  assert.deepEqual(
    findSourceMappingUrlComments({
      outputDir: path.join('.next', 'static'),
      extensions: ['.js', '.mjs', '.cjs', '.css'],
    }),
    [],
    'Client bundles reference source maps even though `sourcemaps.deleteSourcemapsAfterUpload` option is set!',
  );
})();
