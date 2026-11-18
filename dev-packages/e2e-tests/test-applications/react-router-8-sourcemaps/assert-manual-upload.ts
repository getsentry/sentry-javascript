import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getChunkUploadPosts,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const CLIENT_ASSETS_DIR = 'build/client/assets';

/** The debug ID that `sentryOnBuildEnd` injects into a chunk with the Sentry CLI. */
const DEBUG_ID_ASSIGNMENT =
  /_sentryDebugIds\[[^\]]+\]\s*=\s*"([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})"/i;

// `upload: false` with `delete: false`: nothing reaches Sentry, and the hidden maps Sentry turned on
// stay with the debug IDs of their chunks, ready for an upload with the CLI.
assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');
assert.deepEqual(
  findSourceMappingUrlComments({ outputDir: CLIENT_ASSETS_DIR }),
  [],
  `Expected no sourceMappingURL comments in ${CLIENT_ASSETS_DIR}`,
);

const sourceMaps = findSourceMapFiles({ outputDir: CLIENT_ASSETS_DIR });
assert.ok(sourceMaps.length > 0, `Expected Sentry to turn on and keep the source maps in ${CLIENT_ASSETS_DIR}`);

for (const sourceMap of sourceMaps) {
  const chunk = sourceMap.replace(/\.map$/, '');
  const map = JSON.parse(fs.readFileSync(sourceMap, 'utf8')) as { debug_id?: string; debugId?: string };
  const chunkDebugId = fs.readFileSync(chunk, 'utf8').match(DEBUG_ID_ASSIGNMENT)?.[1];

  assert.ok(chunkDebugId, `Expected a debug ID in ${chunk}`);
  assert.equal(
    (map.debug_id ?? map.debugId)?.toLowerCase(),
    chunkDebugId.toLowerCase(),
    `Expected ${path.basename(sourceMap)} to carry the debug ID of its chunk`,
  );
}

console.log(`  ${CLIENT_ASSETS_DIR}: ${sourceMaps.length} kept source map(s), each with the debug ID of its chunk`);
console.log('All source map assertions passed!');
