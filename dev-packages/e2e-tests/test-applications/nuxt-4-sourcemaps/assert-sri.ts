import * as assert from 'assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const PUBLIC_DIR = '.output/public';

const htmlFiles = (fs.readdirSync(PUBLIC_DIR, { recursive: true }) as string[]).filter(file => file.endsWith('.html'));
assert.ok(htmlFiles.length > 0, `Expected prerendered pages in ${PUBLIC_DIR}`);

const checked: { url: string; valid: boolean; content: string }[] = [];
for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, htmlFile), 'utf8');
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const integrity = tag.match(/\sintegrity="([^"]+)"/)?.[1];
    const url = tag.match(/\s(?:src|href)="(\/[^"]+)"/)?.[1];
    if (!integrity || !url) {
      continue;
    }

    const content = fs.readFileSync(path.join(PUBLIC_DIR, url));
    const algorithm = integrity.split('-')[0] as string;
    const valid = integrity === `${algorithm}-${crypto.createHash(algorithm).update(content).digest('base64')}`;
    checked.push({ url, valid, content: content.toString('utf8') });
  }
}

assert.ok(checked.length > 0, 'Expected integrity attributes in the prerendered pages');
assert.deepEqual(
  checked.filter(({ valid }) => !valid).map(({ url }) => url),
  [],
  'Expected the integrity hashes to match the files on disk',
);
assert.ok(
  checked.some(({ content }) => content.includes('sentry-dbid-')),
  'Expected hashed files that carry a Sentry debug ID',
);

console.log(`  ${checked.length} integrity attribute(s) match the files on disk`);
console.log('All SRI assertions passed!');
