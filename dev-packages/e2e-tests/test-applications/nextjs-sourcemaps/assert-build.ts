import * as assert from 'assert/strict';
import {
  loadMockServerResults,
  getArtifactBundles,
  getDebugIdPairs,
  getSourcemaps,
  getChunkUploadPosts,
  getAssembleRequests,
} from '@sentry-internal/test-utils';

const requests = loadMockServerResults();

console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
for (const req of requests) {
  console.log(`  ${req.method} ${req.url} (${req.bodySize} bytes)`);
}
console.log('');

// Auth token is present
const authenticated = requests.filter(r => r.authorization.includes('fake-auth-token'));
assert.ok(authenticated.length > 0, 'Expected requests with the configured auth token');

// Chunk uploads happened
const chunkPosts = getChunkUploadPosts(requests);
assert.ok(chunkPosts.length > 0, 'Expected at least one chunk upload POST');
assert.ok(
  chunkPosts.some(r => r.bodySize > 0),
  'Expected at least one chunk upload with a non-empty body',
);

// Release endpoint was called
assert.ok(
  requests.some(r => r.url?.includes('/releases/')),
  'Expected at least one request to releases endpoint',
);

// Artifact bundles have manifests
const bundles = getArtifactBundles(requests);
assert.ok(bundles.length > 0, 'Expected at least one artifact bundle with a manifest');
console.log(`Found ${bundles.length} artifact bundle(s)\n`);

// Debug ID pairs exist and are valid UUIDs
const debugIdPairs = getDebugIdPairs(bundles);
assert.ok(debugIdPairs.length > 0, 'Expected at least one JS/sourcemap pair with matching debug IDs');

const uuidRegex = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
for (const pair of debugIdPairs) {
  assert.match(pair.debugId, uuidRegex, `Invalid debug ID: ${pair.debugId}`);
  console.log(`  ${pair.debugId}  ${pair.jsUrl}`);
}
console.log('');

// Sourcemaps have real content
const sourcemaps = getSourcemaps(bundles);
assert.ok(
  sourcemaps.some(s => s.sourcemap.mappings && s.sourcemap.mappings.length > 0),
  'Expected at least one sourcemap with non-empty mappings',
);

// At least one sourcemap references app source files
assert.ok(
  sourcemaps.some(s => s.sourcemap.sources?.some(src => /client-page|page\.tsx/.test(src))),
  'Expected at least one sourcemap referencing app source files',
);

// Assemble requests reference the correct project
const assembleReqs = getAssembleRequests(requests);
assert.ok(assembleReqs.length > 0, 'Expected at least one assemble request');
for (const req of assembleReqs) {
  assert.ok(req.assembleBody?.projects?.includes('test-project'), 'Expected assemble request to include test-project');
  assert.ok((req.assembleBody?.chunks?.length ?? 0) > 0, 'Expected assemble request to have chunk checksums');
}

console.log('All sourcemap upload assertions passed!');
