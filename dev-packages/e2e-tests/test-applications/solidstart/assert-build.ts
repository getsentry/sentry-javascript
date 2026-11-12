import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { assertSourceMapUpload, findSourceMapFiles, findSourceMappingUrlComments } from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and asks the bundler plugin to
// remove them, also when no upload runs. Vinxi writes the server output after that, so `.output/server`
// keeps Nitro's own maps, which carry no mappings. They are not served, so only the client output must
// be free of maps.
if (process.env.E2E_NO_UPLOAD) {
  assert.deepEqual(findSourceMapFiles({ outputDir: CLIENT_OUTPUT }), [], `Expected no source maps in ${CLIENT_OUTPUT}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }),
    [],
    `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`,
  );
} else {
  assertSourceMapUpload({
    outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
    strippedDirs: [CLIENT_OUTPUT],
    markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
  });
}

console.log('All sourcemap assertions passed!');
