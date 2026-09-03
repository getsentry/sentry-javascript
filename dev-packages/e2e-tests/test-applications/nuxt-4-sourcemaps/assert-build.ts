import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
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

/** This variant omits `sourcemaps.filesToDeleteAfterUpload`, so Sentry must upload but not delete. */
const keepClientSourceMaps = process.env.E2E_KEEP_CLIENT_SOURCEMAPS === 'true';

/** `nuxt generate` emits no `.output/server`. Keyed on the command so a missing one under `nuxt build` still fails. */
const isStaticBuild = process.env.NUXT_COMMAND === 'generate';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

/** Both markers sit in comments, so bundlers strip them from the code but keep them in `sourcesContent`. */
const CLIENT_MARKER = 'SOURCEMAP_MARKER_CLIENT';
const SERVER_MARKER = 'SOURCEMAP_MARKER_SERVER';

const UUID_REGEX = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function filesContaining(dir: string, needle: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => fs.readFileSync(file, 'utf8').includes(needle));
}

console.log(
  `Variant: ${isStaticBuild ? 'nuxt generate' : 'nuxt build'}, ` +
    `client source maps ${keepClientSourceMaps ? 'kept' : 'deleted'}\n`,
);

const requests = loadMockServerResults();

console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
for (const request of requests) {
  console.log(`  ${request.method} ${request.url} (${request.bodySize} bytes)`);
}
console.log('');

// --- The upload reached Sentry ---

assert.ok(
  requests.some(r => r.authorization.includes('fake-auth-token')),
  'Expected requests with the configured auth token',
);

// Sentry rejects a release that names no project with a 400, and the mock server accepts anything,
// so assert on the body rather than on the call alone.
const releaseCreates = requests.filter(r => r.url?.includes('/releases') && r.method === 'POST');
assert.ok(releaseCreates.length > 0, 'Expected a POST to create the release');
for (const request of releaseCreates) {
  const body = request.jsonBody as { version?: string; projects?: string[] } | undefined;
  assert.equal(
    body?.version,
    'test-release',
    `Expected the release create body to carry the version, got ${JSON.stringify(body)}`,
  );
  assert.deepEqual(
    body?.projects,
    ['test-project'],
    `Expected the release create body to name the project, got ${JSON.stringify(body)}`,
  );
}

assert.ok(
  requests.some(r => r.url?.includes('/releases/') && r.method === 'PUT'),
  'Expected a PUT to finalize the release',
);

assert.ok(
  requests.some(r => r.url?.includes('/chunk-upload/') && r.method === 'GET'),
  'Expected a GET for the chunk-upload options',
);

const chunkPosts = getChunkUploadPosts(requests);
assert.ok(
  chunkPosts.some(r => r.bodySize > 0),
  'Expected at least one chunk upload POST with a non-empty body',
);

const assembleRequests = getAssembleRequests(requests);
assert.ok(assembleRequests.length > 0, 'Expected at least one assemble request');
for (const request of assembleRequests) {
  assert.ok(request.assembleBody?.projects?.includes('test-project'), 'Expected assemble request for test-project');
  assert.equal(request.assembleBody?.version, 'test-release', 'Expected assemble request to reference the release');
  assert.ok((request.assembleBody?.chunks?.length ?? 0) > 0, 'Expected assemble request to have chunk checksums');
  for (const chunk of request.assembleBody?.chunks ?? []) {
    assert.match(chunk, /^[\da-f]{40}$/i, `Expected a SHA-1 chunk checksum, got: ${chunk}`);
  }
}

const bundles = getArtifactBundles(requests);
assert.ok(bundles.length > 0, 'Expected at least one artifact bundle with a manifest');
console.log(`Found ${bundles.length} artifact bundle(s)\n`);

// --- Both bundlers uploaded ---

const sourcemaps = getSourcemaps(bundles);
assert.ok(
  sourcemaps.some(map => map.sourcemap.mappings?.length),
  'Expected at least one uploaded sourcemap with non-empty mappings',
);

const containsMarker = (marker: string): boolean =>
  sourcemaps.some(map => map.sourcemap.sourcesContent?.some(source => source?.includes(marker)));

// Vite builds the client and Nitro's Rollup builds the server. Counting bundles would still pass
// with either plugin dropped, so each side is pinned to a marker only that side's source supplies.
assert.ok(containsMarker(CLIENT_MARKER), 'Expected an uploaded sourcemap carrying the client source (Vite plugin)');
// Nitro defaults to `sourcemapExcludeSources: true`; the module flips it to `false`, which is the
// only reason this marker survives into `sourcesContent`.
assert.ok(containsMarker(SERVER_MARKER), 'Expected an uploaded sourcemap carrying the server source (Rollup plugin)');

// `rewriteSources` normalizes `../../../foo` to `./foo` so paths stay resolvable in Sentry.
const unnormalizedSources = [...new Set(sourcemaps.flatMap(map => map.sourcemap.sources ?? []))].filter(
  source => source.startsWith('../') || path.isAbsolute(source),
);
assert.deepEqual(unnormalizedSources, [], `Expected every uploaded source to be normalized to './…'`);

// --- Debug IDs tie the shipped bundle to the uploaded map ---

const uploadedDebugIds = new Set(getDebugIdPairs(bundles).map(pair => pair.debugId.toLowerCase()));
assert.ok(uploadedDebugIds.size > 0, 'Expected at least one JS/sourcemap pair with matching debug IDs');

const malformedDebugIds = [...uploadedDebugIds].filter(debugId => !UUID_REGEX.test(debugId));
assert.deepEqual(malformedDebugIds, [], 'Expected every uploaded debug ID to be a UUID');

// An uploaded map is only reachable at runtime if the shipped bundle claims the same ID. Inspecting
// the upload alone cannot show this.
for (const outputDir of isStaticBuild ? [CLIENT_OUTPUT] : [CLIENT_OUTPUT, SERVER_OUTPUT]) {
  const injectedDebugIds = findInjectedDebugIds({ outputDir });
  assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);

  const unuploaded = injectedDebugIds.filter(debugId => !uploadedDebugIds.has(debugId));
  assert.deepEqual(unuploaded, [], `Expected every debug ID in ${outputDir} to have an uploaded sourcemap`);

  console.log(`  ${outputDir}: ${injectedDebugIds.length} injected debug ID(s), all uploaded`);
}
console.log('');

// --- What the build leaves behind in the client output ---

const clientSourceMaps = findSourceMapFiles({ outputDir: CLIENT_OUTPUT });

if (keepClientSourceMaps) {
  assert.ok(clientSourceMaps.length > 0, `Expected Sentry to leave the user-enabled maps in ${CLIENT_OUTPUT}`);
  console.log(`  ${clientSourceMaps.length} source map(s) kept in ${CLIENT_OUTPUT}, as configured\n`);
} else {
  // This directory is served to the internet, so a surviving `.map` hands out the original source.
  assert.deepEqual(clientSourceMaps, [], `Expected no source maps in ${CLIENT_OUTPUT} after upload`);

  // The maps are gone, so a surviving reference only 404s in devtools and leaks where they were.
  const danglingReferences = findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT });
  assert.deepEqual(danglingReferences, [], `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`);

  // Catches source maps inlined as `data:` URIs, which the reference check above skips by design.
  const leakedSource = filesContaining(CLIENT_OUTPUT, CLIENT_MARKER);
  assert.deepEqual(leakedSource, [], `Expected no original client source under ${CLIENT_OUTPUT}`);

  console.log(`  ${CLIENT_OUTPUT} is free of source maps, sourceMappingURL comments and original source\n`);
}

console.log('All sourcemap assertions passed!');
