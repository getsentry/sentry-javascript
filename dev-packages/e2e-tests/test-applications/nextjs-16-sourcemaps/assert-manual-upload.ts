import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  findSourceMapFiles,
  findSubresourceIntegrityMismatches,
  getChunkUploadPosts,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

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
const integrityManifest = JSON.parse(
  fs.readFileSync('.next/server/subresource-integrity-manifest.json', 'utf8'),
) as Record<string, string>;
// Next.js hashes `_ssgManifest.js` before it writes the final file, also without Sentry.
const integrities = Object.fromEntries(
  Object.entries(integrityManifest).filter(([file]) => /\.(js|css)$/.test(file) && !file.endsWith('/_ssgManifest.js')),
);
assert.ok(Object.keys(integrities).length > 0, 'Expected client files in the SRI manifest');
assert.deepEqual(
  findSubresourceIntegrityMismatches('.next', integrities),
  [],
  'Expected the SRI hashes to match the stamped client files',
);
assert.ok(
  Object.keys(integrities).some(file => fs.readFileSync(path.join('.next', file), 'utf8').includes('//# debugId=')),
  'Expected hashed client files with a stamped debug ID',
);

console.log(`  ${Object.keys(integrities).length} SRI hash(es) match the client files`);
console.log('All source map assertions passed!');
