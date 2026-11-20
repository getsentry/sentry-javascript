import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getChunkUploadPosts,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

/** Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.ts`. */
const debugIdsWithoutSourceMap = new Set(
  fs.existsSync('.tmp_debug_ids_without_source_map')
    ? fs.readFileSync('.tmp_debug_ids_without_source_map', 'utf8').split('\n').filter(Boolean)
    : [],
);

// `upload: false` with `delete: false`: nothing reaches Sentry, and the hidden maps Sentry turned on for
// the client and the Nitro server stay with the debug IDs of their chunks, ready for an upload with the CLI.
assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');

for (const outputDir of [path.join('.output', 'public'), path.join('.output', 'server')]) {
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

console.log('All source map assertions passed!');
