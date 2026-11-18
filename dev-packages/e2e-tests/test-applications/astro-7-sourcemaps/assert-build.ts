import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSourceMapUpload } from '@sentry-internal/test-utils';

const isStatic = process.env.E2E_ASTRO_OUTPUT === 'static';

const BUILD_OUTPUT = 'dist';
const OUTPUT_DIRS = isStatic ? [BUILD_OUTPUT] : [path.join(BUILD_OUTPUT, 'client'), path.join(BUILD_OUTPUT, 'server')];

assertSourceMapUpload({
  outputDirs: OUTPUT_DIRS,
  // The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
  strippedDirs: [BUILD_OUTPUT],
  markers: {
    'client source': 'SOURCEMAP_MARKER_CLIENT',
    ...(isStatic ? {} : { 'server source': 'SOURCEMAP_MARKER_SERVER' }),
    // Astro 7 writes the prerender build to a hidden `.prerender` folder, which a plain `dist/**/*` glob skips
    'prerendered page source': 'SOURCEMAP_MARKER_PRERENDER',
  },
  // Written by the build, see `recordChunksWithoutSourceMap` in `astro.config.mjs`.
  debugIdsWithoutSourceMap: '.tmp_debug_ids_without_source_map',
});

// The release must stay out of the content-hashed client chunks, or every release renames them and busts their cache.
const CLIENT_DIR = isStatic ? BUILD_OUTPUT : path.join(BUILD_OUTPUT, 'client');
const RELEASE = 'test-release';
const clientChunks = fs.readdirSync(path.join(CLIENT_DIR, '_astro')).filter(file => file.endsWith('.js'));
assert.ok(clientChunks.length > 0, 'Expected client chunks in the build output');
for (const chunk of clientChunks) {
  const code = fs.readFileSync(path.join(CLIENT_DIR, '_astro', chunk), 'utf-8');
  assert.ok(!code.includes(RELEASE), `Expected no release in the client chunk ${chunk}`);
}
assert.ok(
  fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf-8').includes(`globalThis.SENTRY_RELEASE={id:"${RELEASE}"}`),
  'Expected the page HTML to set the release',
);

console.log('All sourcemap assertions passed!');
