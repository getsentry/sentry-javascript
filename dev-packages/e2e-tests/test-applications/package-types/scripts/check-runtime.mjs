/**
 * Checks the JS files that Node loads:
 * - A CJS file sets `__esModule` only if its entry has a default export. With `__esModule`, a default import
 *   compiled by TypeScript (`esModuleInterop`) or a bundler reads `exports.default`, which is `undefined` for an entry
 *   without a default export (https://github.com/getsentry/sentry-javascript/issues/3105).
 * - The fixtures in `src`, compiled to `dist`, run without errors.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { APP_DIR, getPackageNames, getTypedEntries } from './entries.mjs';

const ES_MODULE_MARKER_REGEX =
  /Object\.defineProperty\(\s*exports\s*,\s*['"]__esModule['"]|Object\.defineProperties\(\s*exports\s*,\s*\{\s*__esModule\s*:|exports\.__esModule\s*=/;

const require = createRequire(path.join(APP_DIR, 'package.json'));
const failed = [];

for (const entry of getPackageNames().flatMap(name => getTypedEntries(name))) {
  if (entry.formats.nodeRequire !== 'cjs') {
    continue;
  }

  const file = require.resolve(entry.specifier);
  const hasMarker = ES_MODULE_MARKER_REGEX.test(fs.readFileSync(file, 'utf8'));
  if (hasMarker !== entry.hasDefaultExport) {
    failed.push(
      `${entry.specifier}: ${path.relative(APP_DIR, file)} ${hasMarker ? 'sets' : 'does not set'} __esModule, but the entry ${entry.hasDefaultExport ? 'has' : 'has no'} default export.`,
    );
  }
}

for (const fixture of ['default-import.cjs', 'namespace-import.mjs']) {
  try {
    execFileSync(process.execPath, [path.join(APP_DIR, 'dist', fixture)], { stdio: 'inherit' });
  } catch {
    failed.push(`dist/${fixture} failed.`);
  }
}

if (failed.length) {
  console.error(failed.join('\n'));
  process.exit(1);
}

console.log('Runtime: all checks passed.');
