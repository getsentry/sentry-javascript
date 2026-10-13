import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findInjectedDebugIds,
  findSourceMapFiles,
  getArtifactBundles,
  getAssembleRequests,
  getChunkUploadPosts,
  getDebugIdPairs,
  getSourcemaps,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const isStatic = process.env.E2E_ASTRO_OUTPUT === 'static';

const BUILD_OUTPUT = 'dist';
const OUTPUT_DIRS = isStatic ? [BUILD_OUTPUT] : [path.join(BUILD_OUTPUT, 'client'), path.join(BUILD_OUTPUT, 'server')];

/** All markers sit in comments, so bundlers strip them from the code but keep them in `sourcesContent`. */
const CLIENT_MARKER = 'SOURCEMAP_MARKER_CLIENT';
const SERVER_MARKER = 'SOURCEMAP_MARKER_SERVER';
const PRERENDER_MARKER = 'SOURCEMAP_MARKER_PRERENDER';

/** Written by the build, see `recordChunksWithoutSourceMap` in `astro.config.mjs`. */
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
if (!isStatic) {
  assert.ok(containsMarker(SERVER_MARKER), 'Expected an uploaded sourcemap carrying the server source');
}
// Astro 7 writes the prerender build to a hidden `.prerender` folder, which a plain `dist/**/*` glob skips
assert.ok(containsMarker(PRERENDER_MARKER), 'Expected an uploaded sourcemap carrying the prerendered page source');

const buildOutput = ['.tmp_build_stdout', '.tmp_build_stderr']
  .filter(file => fs.existsSync(file))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');
assert.ok(
  !buildOutput.includes("Didn't find any matching sources for debug ID upload"),
  'Expected every Vite build to find sources for the debug ID upload',
);

const uploadedDebugIds = new Set(getDebugIdPairs(bundles).map(pair => pair.debugId.toLowerCase()));
assert.ok(uploadedDebugIds.size > 0, 'Expected at least one JS/sourcemap pair with matching debug IDs');

for (const outputDir of OUTPUT_DIRS) {
  const injectedDebugIds = findInjectedDebugIds({ outputDir });
  assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);

  const unuploaded = injectedDebugIds.filter(
    debugId => !uploadedDebugIds.has(debugId) && !debugIdsWithoutSourceMap.has(debugId),
  );
  assert.deepEqual(unuploaded, [], `Expected every debug ID in ${outputDir} to have an uploaded sourcemap`);
}

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
assert.deepEqual(findSourceMapFiles({ outputDir: BUILD_OUTPUT }), [], `Expected no source maps in ${BUILD_OUTPUT}`);

console.log('All sourcemap assertions passed!');
