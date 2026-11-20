import * as assert from 'assert/strict';
import * as fs from 'fs';
import { findSourceMapFiles, getChunkUploadPosts, loadMockServerResults } from '@sentry-internal/test-utils';

const STATIC_DIR = '.next/static';

// `upload: false` with `delete: false`: nothing reaches Sentry, and the client source maps Sentry turned on
// stay with their debug IDs, ready for an upload with the CLI.
assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');

const sourceMaps = findSourceMapFiles({ outputDir: STATIC_DIR }).filter(file => /\.[cm]?js\.map$/.test(file));
assert.ok(sourceMaps.length > 0, `Expected Sentry to turn on and keep the source maps in ${STATIC_DIR}`);

const mapsWithDebugId = sourceMaps.filter(file => {
  const map = JSON.parse(fs.readFileSync(file, 'utf8')) as { debug_id?: string; debugId?: string };
  return !!(map.debug_id ?? map.debugId);
});
assert.ok(mapsWithDebugId.length > 0, `Expected source maps with a debug ID in ${STATIC_DIR}`);

console.log(`  ${STATIC_DIR}: ${sourceMaps.length} kept source map(s), ${mapsWithDebugId.length} with a debug ID`);
console.log('All source map assertions passed!');
