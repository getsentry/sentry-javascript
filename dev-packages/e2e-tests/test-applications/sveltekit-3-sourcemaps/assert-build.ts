import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getArtifactBundles,
  getAssembleRequests,
  getChunkUploadPosts,
  getDebugIdPairs,
  getSourcemaps,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const BUILD_OUTPUT = 'build';
const CLIENT_OUTPUT = path.join(BUILD_OUTPUT, 'client');
const SERVER_OUTPUT = path.join(BUILD_OUTPUT, 'server');

/** Both markers sit in comments, so bundlers strip them from the code but keep them in `sourcesContent`. */
const CLIENT_MARKER = 'SOURCEMAP_MARKER_CLIENT';
const SERVER_MARKER = 'SOURCEMAP_MARKER_SERVER';

/** Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.js`. */
const debugIdsWithoutSourceMap = new Set(
  fs.existsSync('.tmp_debug_ids_without_source_map')
    ? fs.readFileSync('.tmp_debug_ids_without_source_map', 'utf8').split('\n').filter(Boolean)
    : [],
);

const requests = loadMockServerResults();

console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
for (const request of requests) {
  console.log(`  ${request.method} ${request.url} (${request.bodySize} bytes)`);
}
console.log('');

assert.ok(
  requests.some(r => r.authorization.includes('fake-auth-token')),
  'Expected requests with the configured auth token',
);

assert.ok(
  requests.some(r => r.url?.includes('/releases') && r.method === 'POST'),
  'Expected a POST to create the release',
);

assert.ok(
  getChunkUploadPosts(requests).some(r => r.bodySize > 0),
  'Expected at least one chunk upload POST with a non-empty body',
);

const assembleRequests = getAssembleRequests(requests);
assert.ok(assembleRequests.length > 0, 'Expected at least one assemble request');
for (const request of assembleRequests) {
  assert.ok(request.assembleBody?.projects?.includes('test-project'), 'Expected assemble request for test-project');
  assert.equal(request.assembleBody?.version, 'test-release', 'Expected assemble request to reference the release');
}

const bundles = getArtifactBundles(requests);
assert.ok(bundles.length > 0, 'Expected at least one artifact bundle with a manifest');

const sourcemaps = getSourcemaps(bundles);

const containsMarker = (marker: string): boolean =>
  sourcemaps.some(map => map.sourcemap.sourcesContent?.some(source => source?.includes(marker)));

assert.ok(containsMarker(CLIENT_MARKER), 'Expected an uploaded sourcemap carrying the client source');
assert.ok(containsMarker(SERVER_MARKER), 'Expected an uploaded sourcemap carrying the server source');

// The auto-instrument plugin loads wrapped modules under this suffix. It must be stripped before
// upload, or the uploaded sources don't match the frames Sentry receives.
const wrappedSources = sourcemaps
  .flatMap(map => map.sourcemap.sources ?? [])
  .filter(source => source.includes('?sentry-auto-wrap'));
assert.deepEqual(wrappedSources, [], 'Expected no uploaded source to carry the auto-wrap query suffix');

const uploadedDebugIds = new Set(getDebugIdPairs(bundles).map(pair => pair.debugId.toLowerCase()));
assert.ok(uploadedDebugIds.size > 0, 'Expected at least one JS/sourcemap pair with matching debug IDs');

for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
  const injectedDebugIds = findInjectedDebugIds({ outputDir });
  assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);

  const unuploaded = injectedDebugIds.filter(
    debugId => !uploadedDebugIds.has(debugId) && !debugIdsWithoutSourceMap.has(debugId),
  );
  assert.deepEqual(unuploaded, [], `Expected every debug ID in ${outputDir} to have an uploaded sourcemap`);
}

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
assert.deepEqual(findSourceMapFiles({ outputDir: BUILD_OUTPUT }), [], `Expected no source maps in ${BUILD_OUTPUT}`);
assert.deepEqual(
  findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }),
  [],
  `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`,
);

console.log('All sourcemap assertions passed!');
