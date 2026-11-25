import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { findSourceMapFiles, findSourceMappingUrlComments } from '@sentry-internal/test-utils';

// Without an auth token no upload can run, so the SDK turns on no source maps for the client and the
// Nitro server.
for (const outputDir of [path.join('.output', 'public'), path.join('.output', 'server')]) {
  assert.deepEqual(findSourceMapFiles({ outputDir }), [], `Expected no source maps in ${outputDir}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir }),
    [],
    `Expected no sourceMappingURL comments in ${outputDir}`,
  );
}

const buildLog = fs.readFileSync('.tmp_build_stdout', 'utf8') + fs.readFileSync('.tmp_build_stderr', 'utf8');
assert.ok(
  !buildLog.includes('deleteSourcemapsAfterUpload'),
  'Expected no message about `sourcemaps.deleteSourcemapsAfterUpload`, which the app does not set',
);

console.log('All source map assertions passed!');
