import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  getArtifactBundles,
  getAssembleRequests,
  getDebugIdPairs,
  getSourcemaps,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const OUTPUT_DIR = '.output';

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const requests = loadMockServerResults();

console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
for (const req of requests) {
  console.log(`  ${req.method} ${req.url} (${req.bodySize} bytes)`);
}
console.log('');

// Auth token is forwarded on the upload requests.
const authenticated = requests.filter(r => r.authorization.includes('fake-auth-token'));
assert.ok(authenticated.length > 0, 'Expected requests carrying the configured auth token');

// The bundler plugin creates and finalizes the release. Sentry rejects a release that names no
// project (400), and the mock server accepts anything, so check the body and not just the call.
const releaseCreates = requests.filter(r => r.url?.includes('/releases') && r.method === 'POST');
assert.ok(releaseCreates.length > 0, 'Expected a POST to create the release');
for (const req of releaseCreates) {
  assert.deepEqual(
    req.jsonBody,
    { ...(req.jsonBody as object), version: 'test-release', projects: ['test-project'] },
    `Expected the release create body to carry version and project, got ${JSON.stringify(req.jsonBody)}`,
  );
}
assert.ok(
  requests.some(r => r.url?.includes('/releases/') && r.method === 'PUT'),
  'Expected a PUT to finalize the release',
);

// Chunk-upload options are fetched before uploading.
assert.ok(
  requests.some(r => r.url?.includes('/chunk-upload/') && r.method === 'GET'),
  'Expected a GET for chunk-upload options',
);

// The Nuxt module registers the plugin for both the Vite (client) and the Nitro Rollup (server)
// build, so the upload runs once per bundler. Each upload is assemble-first: the CLI posts the
// chunk checksums, the mock server reports them as missing, the CLI POSTs the bundle and
// assembles again.
const assembleReqs = getAssembleRequests(requests);
assert.ok(assembleReqs.length > 0, 'Expected at least one artifact bundle assemble request');
for (const req of assembleReqs) {
  assert.ok(req.assembleBody?.projects?.includes('test-project'), 'Expected assemble request to target test-project');
  assert.ok(req.assembleBody?.version === 'test-release', 'Expected assemble request to reference the release version');
  assert.ok((req.assembleBody?.chunks?.length ?? 0) > 0, 'Expected assemble request to carry chunk checksums');
  const sha1 = /^[\da-f]{40}$/i;
  for (const chunk of req.assembleBody?.chunks ?? []) {
    assert.match(chunk, sha1, `Expected a SHA-1 chunk checksum, got: ${chunk}`);
  }
}
console.log(`Verified ${assembleReqs.length} assemble request(s) with valid chunk checksums\n`);

const bundles = getArtifactBundles(requests);
assert.ok(bundles.length >= 2, `Expected a client and a server artifact bundle, got ${bundles.length}`);

// Every uploaded JS file must carry a `debug-id` manifest header that its source map shares.
// Sentry pairs a runtime debug ID with the uploaded map through these headers, so a bundle
// whose files have IDs embedded but no headers (the `--no-rewrite` failure mode of the CLI SDK)
// leaves every frame minified even though the upload "succeeded".
const debugIdPairs = getDebugIdPairs(bundles);
const minifiedSources = bundles.flatMap(bundle =>
  Object.values(bundle.manifest.files).filter(file => file.type === 'minified_source'),
);
assert.ok(minifiedSources.length > 0, 'Expected at least one minified source in the uploaded bundles');
assert.equal(
  debugIdPairs.length,
  minifiedSources.length,
  `Expected every uploaded JS file to have a source map with a matching debug ID (${debugIdPairs.length}/${minifiedSources.length} do)`,
);
const uuidRegex = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
for (const pair of debugIdPairs) {
  assert.match(pair.debugId, uuidRegex, `Invalid debug ID: ${pair.debugId}`);
  console.log(`  ${pair.debugId}  ${pair.jsUrl}`);
}
console.log(`${debugIdPairs.length} JS/source map pair(s) share a debug ID\n`);

// The maps that reached Sentry have real content. Together with the on-disk check below this
// proves `filesToDeleteAfterUpload` ran after the upload, not before it. Not every map qualifies:
// Nitro emits several server chunk maps with `sources` but empty `mappings` on its own (without
// the Sentry module), so only require that some map carries mappings.
const uploadedSourcemaps = getSourcemaps(bundles);
assert.ok(uploadedSourcemaps.length > 0, 'Expected at least one source map in the uploaded artifact bundles');
const sourcemapsWithContent = uploadedSourcemaps.filter(entry => (entry.sourcemap.mappings?.length ?? 0) > 0);
assert.ok(sourcemapsWithContent.length > 0, 'Expected at least one uploaded source map with non-empty mappings');
console.log(`${sourcemapsWithContent.length}/${uploadedSourcemaps.length} source map(s) uploaded with mappings\n`);

// `filesToDeleteAfterUpload` removed the maps from the deployable output.
assert.ok(fs.existsSync(OUTPUT_DIR), `Expected ${OUTPUT_DIR} to exist. Did the build run?`);
const outputFiles = listFiles(OUTPUT_DIR);
const outputJsFiles = outputFiles.filter(file => /\.(m?js)$/.test(file));
const leftoverMaps = outputFiles.filter(file => file.endsWith('.map'));
assert.ok(outputJsFiles.length > 0, `Expected JS chunks in ${OUTPUT_DIR}`);
assert.deepEqual(
  leftoverMaps,
  [],
  `Expected no .map files in ${OUTPUT_DIR} after upload, found: ${leftoverMaps.join(', ')}`,
);
console.log(`no source maps left in ${OUTPUT_DIR} (${outputJsFiles.length} JS chunks remain)\n`);

console.log('All sourcemap upload assertions passed!');
