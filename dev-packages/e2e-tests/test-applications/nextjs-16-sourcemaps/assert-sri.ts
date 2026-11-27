import * as assert from 'assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const NEXT_DIR = '.next';
const MANIFEST = path.join(NEXT_DIR, 'server/subresource-integrity-manifest.json');

// Next.js hashes `_ssgManifest.js` before it writes the final file, also without Sentry.
const NEXT_STALE_FILE = /\/_ssgManifest\.js$/;

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Record<string, string>;
const entries = Object.entries(manifest).filter(([file]) => /\.(js|css)$/.test(file) && !NEXT_STALE_FILE.test(file));
assert.ok(entries.length > 0, `Expected JS and CSS files in ${MANIFEST}`);

const mismatches = entries.filter(([file, integrity]) => {
  const algorithm = integrity.split('-')[0] as string;
  const content = fs.readFileSync(path.join(NEXT_DIR, file));
  return integrity !== `${algorithm}-${crypto.createHash(algorithm).update(content).digest('base64')}`;
});
assert.deepEqual(
  mismatches.map(([file]) => file),
  [],
  'Expected the integrity hashes to match the files on disk',
);

const withDebugId = entries.filter(([file]) =>
  /\/\/# debugId=|sentry-dbid-/.test(fs.readFileSync(path.join(NEXT_DIR, file), 'utf8')),
);
assert.ok(withDebugId.length > 0, 'Expected hashed files that carry a Sentry debug ID');

console.log(`  ${entries.length} hashed file(s) match, ${withDebugId.length} with a debug ID`);
console.log('All SRI assertions passed!');
