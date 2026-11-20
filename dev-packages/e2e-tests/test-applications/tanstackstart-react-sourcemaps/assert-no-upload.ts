import * as assert from 'assert/strict';
import * as path from 'path';
import { findSourceMapFiles, findSourceMappingUrlComments } from '@sentry-internal/test-utils';

// Without an auth token nothing is uploaded, but the SDK still asks the bundler plugin to remove the
// source maps it turned on for the client and the Nitro server.
for (const outputDir of [path.join('.output', 'public'), path.join('.output', 'server')]) {
  assert.deepEqual(findSourceMapFiles({ outputDir }), [], `Expected no source maps in ${outputDir}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir }),
    [],
    `Expected no sourceMappingURL comments in ${outputDir}`,
  );
}

console.log('All source map assertions passed!');
