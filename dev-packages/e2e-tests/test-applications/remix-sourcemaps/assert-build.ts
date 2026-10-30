import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { assertSourceMapUpload } from '@sentry-internal/test-utils';

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

// The plugin defaults `filesToDeleteAfterUpload` when the app configures no source map setting. Remix
// runs a client and an SSR pass with different `outDir`s, while the deletion glob is held in a promise
// that settles once, so a leftover `.map` means the second pass was left behind.
assertSourceMapUpload({
  outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
  strippedDirs: [BUILD_DIR],
  markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
});

console.log('All sourcemap assertions passed!');
