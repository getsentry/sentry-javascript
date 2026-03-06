import {
  loadSourcemapUploadRecords,
  assertSourcemapUploadRequests,
  getArtifactBundleManifests,
  assertDebugIdPairs,
  assertSourcemapMappings,
  assertSourcemapSources,
  assertArtifactBundleAssembly,
  getSourcemapUploadSummary,
} from '@sentry-internal/test-utils';

const requests = loadSourcemapUploadRecords();

console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
for (const req of requests) {
  console.log(`  ${req.method} ${req.url} (${req.bodySize} bytes)`);
}
console.log('');

assertSourcemapUploadRequests(requests, 'fake-auth-token');

const manifests = getArtifactBundleManifests(requests);
console.log(`Found ${manifests.length} artifact bundle manifest(s):\n`);

const debugIdPairs = assertDebugIdPairs(manifests);
console.log(`Found ${debugIdPairs.length} JS/sourcemap pairs with debug IDs:`);
for (const pair of debugIdPairs) {
  console.log(`  ${pair.debugId}  ${pair.jsUrl}`);
}
console.log('');

assertSourcemapMappings(manifests);
assertSourcemapSources(manifests, /client-page|page\.tsx/);
assertArtifactBundleAssembly(requests, 'test-project');

const summary = getSourcemapUploadSummary(requests, manifests, debugIdPairs);

console.log('\nAll sourcemap upload assertions passed!');
console.log(`  - ${summary.totalRequests} total requests captured`);
console.log(`  - ${summary.chunkUploadPosts} chunk upload POST requests`);
console.log(`  - ${summary.artifactBundles} artifact bundles with manifests`);
console.log(`  - ${summary.debugIdPairs} JS/sourcemap pairs with debug IDs`);
console.log(`  - ${summary.assembleRequests} artifact bundle assemble requests`);
