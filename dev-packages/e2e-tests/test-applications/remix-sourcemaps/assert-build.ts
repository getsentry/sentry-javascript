import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertSourceMapUpload,
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getChunkUploadPosts,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const BUILD_DIR = 'build';
const CLIENT_OUTPUT = path.join(BUILD_DIR, 'client');
const SERVER_OUTPUT = path.join(BUILD_DIR, 'server');
const CLIENT_ASSETS_DIR = path.join(CLIENT_OUTPUT, 'assets');

// Both injectors write this assignment, so counting it per file counts injections regardless of
// which one ran. Matching only the bundler plugin's trailing `_sentryDebugIdIdentifier` would miss
// the `sentry-cli` snippet, which omits it.
const DEBUG_ID_ASSIGNMENT =
  /_sentryDebugIds\[[^\]]+\]\s*=\s*"([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})"/gi;

assert.ok(fs.existsSync(CLIENT_ASSETS_DIR), `Expected ${CLIENT_ASSETS_DIR} to exist. Did the build run?`);

const chunks = fs
  .readdirSync(CLIENT_ASSETS_DIR)
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(CLIENT_ASSETS_DIR, file));
assert.ok(chunks.length > 0, `Expected at least one client chunk in ${CLIENT_ASSETS_DIR}`);

// No chunk carries more than one debug ID.
//
// Two injections per chunk is the failure mode of
// https://github.com/getsentry/sentry-javascript/issues/22929: both snippets run at runtime,
// `applyDebugIds` flattens them to a single filename, and the last one wins. For Remix that happens
// when an app keeps `npx @sentry/remix --upload-sourcemaps` in its build script alongside the Vite
// plugin, so the CLI injects a second ID over the plugin's.
for (const chunk of chunks) {
  const ids = [...fs.readFileSync(chunk, 'utf-8').matchAll(DEBUG_ID_ASSIGNMENT)].map(match => match[1] as string);

  assert.ok(
    ids.length <= 1,
    `Expected at most one debug ID in ${chunk}, found ${ids.length}: ${JSON.stringify([...new Set(ids)])}.`,
  );
}
console.log(`no client chunk carries more than one debug ID (${chunks.length} chunks)\n`);

// The SDK turns on hidden source maps when the app sets none, and asks the bundler plugin to
// remove them from both the client and the SSR output, also when no upload runs.
if (process.env.E2E_NO_UPLOAD) {
  // The mock server only writes its results file when a request reaches it.
  const requests = fs.existsSync('.tmp_mock_uploads.json') ? loadMockServerResults() : [];
  assert.deepEqual(getChunkUploadPosts(requests), [], 'Expected no source map upload');
  assert.deepEqual(findSourceMapFiles({ outputDir: BUILD_DIR }), [], `Expected no source maps in ${BUILD_DIR}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: BUILD_DIR }),
    [],
    `Expected no sourceMappingURL comments in ${BUILD_DIR}`,
  );
} else if (process.env.E2E_VARIANT === 'manual-upload') {
  // `upload: false` with `delete: false`: nothing reaches Sentry, and the hidden maps Sentry turned on
  // stay with the debug IDs of their chunks, ready for an upload with the CLI.
  assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: BUILD_DIR }),
    [],
    `Expected no sourceMappingURL comments in ${BUILD_DIR}`,
  );

  for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
    const mapDebugIds = new Set(
      findSourceMapFiles({ outputDir }).map(file => {
        const map = JSON.parse(fs.readFileSync(file, 'utf-8')) as { debug_id?: string; debugId?: string };
        return (map.debug_id ?? map.debugId)?.toLowerCase();
      }),
    );
    const injectedDebugIds = findInjectedDebugIds({ outputDir });

    assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);
    assert.deepEqual(
      injectedDebugIds.filter(debugId => !mapDebugIds.has(debugId)),
      [],
      `Expected a source map with the same debug ID for every chunk in ${outputDir}`,
    );
    console.log(`  ${outputDir}: ${injectedDebugIds.length} debug ID(s), each with a kept source map`);
  }
} else {
  // Also covers the `delete-all` variant: the maps the app turned on are uploaded and removed.
  assertSourceMapUpload({
    outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
    strippedDirs: [BUILD_DIR],
    markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
  });
}

console.log('All sourcemap assertions passed!');
