import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { getArtifactBundles, getDebugIdPairs, getSourcemaps, loadMockServerResults } from '@sentry-internal/test-utils';

const CLIENT_ASSETS_DIR = 'build/client/assets';

// Both injectors write this assignment, so counting it per file counts injections regardless of
// which one ran. Matching only the bundler plugin's trailing `_sentryDebugIdIdentifier` would miss
// the `sentry-cli` snippet, which omits it.
const DEBUG_ID_ASSIGNMENT =
  /_sentryDebugIds\[[^\]]+\]\s*=\s*"([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})"/gi;

function getClientChunks(): string[] {
  assert.ok(fs.existsSync(CLIENT_ASSETS_DIR), `Expected ${CLIENT_ASSETS_DIR} to exist. Did the build run?`);

  return fs
    .readdirSync(CLIENT_ASSETS_DIR)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(CLIENT_ASSETS_DIR, file));
}

const chunks = getClientChunks();
assert.ok(chunks.length > 0, `Expected at least one client chunk in ${CLIENT_ASSETS_DIR}`);

// 1. No chunk carries more than one debug ID.
//
// Two injections per chunk is the failure mode of
// https://github.com/getsentry/sentry-javascript/issues/22929: both snippets run at runtime,
// `applyDebugIds` flattens them to a single filename, and the last one wins. For Remix that happens
// when an app keeps `npx @sentry/remix --upload-sourcemaps` in its build script alongside the Vite
// plugin, so the CLI injects a second ID over the plugin's.
const injectedDebugIds = new Map<string, string>();

for (const chunk of chunks) {
  const code = fs.readFileSync(chunk, 'utf-8');
  const ids = [...code.matchAll(DEBUG_ID_ASSIGNMENT)].map(match => match[1] as string);

  assert.ok(
    ids.length <= 1,
    `Expected at most one debug ID in ${chunk}, found ${ids.length}: ${JSON.stringify([...new Set(ids)])}.`,
  );

  if (ids.length === 1) {
    injectedDebugIds.set(chunk, ids[0] as string);
  }
}

console.log(`no client chunk carries more than one debug ID (${injectedDebugIds.size}/${chunks.length} carry one)\n`);

const requests = loadMockServerResults();
const bundles = getArtifactBundles(requests);
assert.ok(bundles.length > 0, 'Expected at least one uploaded artifact bundle');

// 2. Source maps with real content reached Sentry.
//
// Asserting on the upload rather than on disk, because deleting the maps after a successful upload
// is the intended behaviour - the plugin defaults `filesToDeleteAfterUpload` when the app does not
// configure source maps itself.
const uploadedSourcemaps = getSourcemaps(bundles);
assert.ok(uploadedSourcemaps.length > 0, 'Expected at least one source map in the uploaded artifact bundles');
assert.ok(
  uploadedSourcemaps.some(entry => (entry.sourcemap.mappings?.length ?? 0) > 0),
  'Expected at least one uploaded source map with non-empty mappings',
);
console.log(`${uploadedSourcemaps.length} source map(s) uploaded with content`);

// 3. The debug IDs that shipped are the ones that were uploaded.
//
// This is what actually breaks un-minification: a chunk can carry a perfectly valid debug ID that
// has no artifact bundle behind it.
const debugIdPairs = getDebugIdPairs(bundles);
const uploadedDebugIds = new Set(debugIdPairs.map(pair => pair.debugId.toLowerCase()));
assert.ok(uploadedDebugIds.size > 0, 'Expected at least one uploaded JS/source map pair with a debug ID');

// Vite emits some assets without a source map, so they can never be part of an uploaded pair. Key
// off the uploaded JS file names instead of the maps on disk, which are deleted after upload.
const uploadedJsFiles = new Set(debugIdPairs.map(pair => path.basename(pair.jsUrl)));
let crossCheckedChunks = 0;

for (const chunk of chunks) {
  if (!uploadedJsFiles.has(path.basename(chunk))) {
    continue;
  }

  const injectedDebugId = injectedDebugIds.get(chunk);
  assert.ok(
    injectedDebugId,
    `Expected exactly one debug ID in ${chunk}, found none, even though its source map was uploaded.`,
  );

  assert.ok(
    uploadedDebugIds.has(injectedDebugId.toLowerCase()),
    `Debug ID ${injectedDebugId} in ${chunk} was never uploaded.`,
  );
  crossCheckedChunks++;
}

assert.ok(
  crossCheckedChunks > 0,
  'Expected at least one uploaded chunk to cross-check debug IDs against.\n' +
    `Client chunks:      ${JSON.stringify(chunks.map(chunk => path.basename(chunk)))}\n` +
    `Uploaded JS names:  ${JSON.stringify([...uploadedJsFiles])}\n` +
    `Uploaded JS urls:   ${JSON.stringify(debugIdPairs.map(pair => pair.jsUrl))}`,
);
console.log(`${crossCheckedChunks} chunk(s) ship a debug ID that was uploaded\n`);

console.log('All remix source map assertions passed!');
