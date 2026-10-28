import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { assertSourceMapUpload, findSourceMapFiles } from '@sentry-internal/test-utils';

const BUILD_OUTPUT = 'build';
const CLIENT_OUTPUT = path.join(BUILD_OUTPUT, 'client');
const SERVER_OUTPUT = path.join(BUILD_OUTPUT, 'server');

const { requests, sourcemaps } = assertSourceMapUpload({
  outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
  // The server output keeps `sourceMappingURL` comments that point at the deleted maps. Nothing serves
  // it, so only the client output must be free of them.
  strippedDirs: [CLIENT_OUTPUT],
  markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
  // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.js`.
  debugIdsWithoutSourceMap: '.tmp_debug_ids_without_source_map',
});

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
assert.deepEqual(findSourceMapFiles({ outputDir: BUILD_OUTPUT }), [], `Expected no source maps in ${BUILD_OUTPUT}`);

assert.ok(
  requests.some(r => r.url?.includes('/releases') && r.method === 'POST'),
  'Expected a POST to create the release',
);

// The auto-instrument plugin loads wrapped modules under this suffix. It must be stripped before
// upload, or the uploaded sources don't match the frames Sentry receives.
const wrappedSources = sourcemaps
  .flatMap(map => map.sourcemap.sources ?? [])
  .filter(source => source.includes('?sentry-auto-wrap'));
assert.deepEqual(wrappedSources, [], 'Expected no uploaded source to carry the auto-wrap query suffix');

console.log('All sourcemap assertions passed!');
