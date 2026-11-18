import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertSourceMapUpload,
  findDebugIdsInFilesWithGlobCharacters,
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getChunkUploadPosts,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

/** Debug IDs of chunks for which no source map can be uploaded. */
const debugIdsWithoutSourceMap = [
  // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.ts`.
  ...(fs.existsSync('.tmp_debug_ids_without_source_map')
    ? fs.readFileSync('.tmp_debug_ids_without_source_map', 'utf8').split('\n').filter(Boolean)
    : []),
  ...findDebugIdsInFilesWithGlobCharacters({ outputDir: SERVER_OUTPUT }),
];

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and asks the bundler plugin to
// remove them from the client output, also when no upload runs. `@sentry/nitro` handles the server output.
if (process.env.E2E_NO_UPLOAD) {
  assert.deepEqual(findSourceMapFiles({ outputDir: CLIENT_OUTPUT }), [], `Expected no source maps in ${CLIENT_OUTPUT}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }),
    [],
    `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`,
  );
} else if (process.env.E2E_VARIANT === 'manual-upload') {
  // `upload: false` with `delete: false`: nothing reaches Sentry, and the hidden maps Sentry turned on
  // stay with the debug IDs of their chunks, ready for an upload with the CLI.
  assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');

  for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
    assert.deepEqual(
      findSourceMappingUrlComments({ outputDir }),
      [],
      `Expected no sourceMappingURL comments in ${outputDir}`,
    );

    const mapDebugIds = new Set(
      findSourceMapFiles({ outputDir }).map(file => {
        const map = JSON.parse(fs.readFileSync(file, 'utf8')) as { debug_id?: string; debugId?: string };
        return (map.debug_id ?? map.debugId)?.toLowerCase();
      }),
    );
    const injectedDebugIds = findInjectedDebugIds({ outputDir });

    assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);
    assert.deepEqual(
      injectedDebugIds.filter(debugId => !mapDebugIds.has(debugId) && !debugIdsWithoutSourceMap.includes(debugId)),
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
  assertSourceMapUpload({
    outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
    markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
    debugIdsWithoutSourceMap,
  });
}

// The server adds the release to the page, so no content-hashed client file may contain it.
const clientFilesWithRelease = fs
  .readdirSync(CLIENT_OUTPUT, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && !entry.name.endsWith('.html'))
  .map(entry => path.join(entry.parentPath, entry.name))
  .filter(file => fs.readFileSync(file, 'utf8').includes('test-release'));
if (clientFilesWithRelease.length > 0) {
  throw new Error(`The release was written into client files: ${clientFilesWithRelease.join(', ')}`);
}

console.log('All sourcemap and release assertions passed!');
