import * as assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertSourceMapUpload,
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getChunkUploadPosts,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const BUILD_OUTPUT = 'build';
const CLIENT_OUTPUT = path.join(BUILD_OUTPUT, 'client');
const SERVER_OUTPUT = path.join(BUILD_OUTPUT, 'server');

if (process.env.E2E_VARIANT === 'manual-upload') {
  // `upload: false` with `delete: false`: nothing reaches Sentry, and the hidden maps Sentry turned on
  // stay with the debug IDs of their chunks, ready for an upload with the CLI.
  assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }),
    [],
    `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`,
  );

  // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.js`.
  const debugIdsWithoutSourceMap = new Set(
    fs.existsSync('.tmp_debug_ids_without_source_map')
      ? fs.readFileSync('.tmp_debug_ids_without_source_map', 'utf8').split('\n').filter(Boolean)
      : [],
  );

  for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
    const mapDebugIds = new Set(
      findSourceMapFiles({ outputDir }).map(file => {
        const map = JSON.parse(fs.readFileSync(file, 'utf8')) as { debug_id?: string; debugId?: string };
        return (map.debug_id ?? map.debugId)?.toLowerCase();
      }),
    );
    const injectedDebugIds = findInjectedDebugIds({ outputDir });

    assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);
    assert.deepEqual(
      injectedDebugIds.filter(debugId => !mapDebugIds.has(debugId) && !debugIdsWithoutSourceMap.has(debugId)),
      [],
      `Expected a source map with the same debug ID for every chunk in ${outputDir}`,
    );
    assert.ok(
      injectedDebugIds.some(debugId => mapDebugIds.has(debugId)),
      `Expected at least one chunk in ${outputDir} to have a kept source map`,
    );
    console.log(`  ${outputDir}: ${injectedDebugIds.length} debug ID(s), ${mapDebugIds.size} kept source map(s)`);
  }
} else {
  // Also covers the `delete-all` variant: the maps the app turned on are uploaded and removed.
  const { requests, sourcemaps } = assertSourceMapUpload({
    outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
    // The server output keeps `sourceMappingURL` comments that point at the deleted maps. Nothing serves
    // it, so only the client output must be free of them.
    strippedDirs: [CLIENT_OUTPUT],
    markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
    // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.js`.
    debugIdsWithoutSourceMap: '.tmp_debug_ids_without_source_map',
  });

  // The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
  assert.deepEqual(findSourceMapFiles({ outputDir: BUILD_OUTPUT }), [], `Expected no source maps in ${BUILD_OUTPUT}`);

  assert.ok(
    requests.some(r => r.url?.includes('/releases') && r.method === 'POST'),
    'Expected a POST to create the release',
  );

  // The auto-instrument plugin loads wrapped modules under this suffix. It must be stripped before
  // upload, or the uploaded sources don't match the frames Sentry receives.
  const wrappedSources = sourcemaps
    .flatMap(map => map.sourcemap.sources ?? [])
    .filter(source => source.includes('?sentry-auto-wrap'));
  assert.deepEqual(wrappedSources, [], 'Expected no uploaded source to carry the auto-wrap query suffix');
}

console.log('All sourcemap assertions passed!');

// A release in a content-hashed client chunk renames it on every release, so the SDK hands the release to
// the browser through the server-rendered page instead.
const clientFilesWithRelease = fs
  .readdirSync(CLIENT_OUTPUT, { recursive: true, encoding: 'utf8' })
  .filter(
    file => /\.js$/.test(file) && fs.readFileSync(path.join(CLIENT_OUTPUT, file), 'utf8').includes('test-release'),
  );
assert.deepEqual(clientFilesWithRelease, [], 'Expected no client chunk to contain the release');

const server = spawn('node', [BUILD_OUTPUT], { env: { ...process.env, PORT: '3033' }, stdio: 'ignore' });
try {
  let html = '';
  for (let attempt = 0; attempt < 50 && !html; attempt++) {
    html = await fetch('http://localhost:3033/').then(
      res => res.text(),
      () => new Promise<string>(resolve => setTimeout(() => resolve(''), 100)),
    );
  }
  assert.ok(
    html.includes('<meta name="sentry-release" content="test-release"/>'),
    'Expected the page to carry the release',
  );
} finally {
  server.kill();
}

console.log('All release assertions passed!');
