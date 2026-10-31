import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Node resolves, reads and evaluates each published file on its own, so
 * the number of files that `@sentry/node` loads sets most of its startup
 * cost. Our CJS builds publish flat entry files with a few shared chunks.
 * The ESM builds keep one file per module, because bundlers use them and
 * drop unused files. A count is stable in CI, where a timing is not.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'dist', 'startup');

// One entry file and its shared chunks.
const MAX_FILES_PER_PACKAGE = 10;

const COUNTER = `import { writeSync } from 'node:fs';
import { registerHooks } from 'node:module';
const files = new Set();
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:')) files.add(url);
    return nextLoad(url, context);
  },
});
// A pipe write from an exit handler must be sync, or Node cuts it off.
process.on('exit', () => writeSync(1, JSON.stringify([...files])));
`;

function loadedFiles(specifier: string): string[] {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const counter = path.join(FIXTURE_DIR, 'counter.mjs');
  fs.writeFileSync(counter, COUNTER);
  const fixture = path.join(FIXTURE_DIR, `${specifier.replace(/[@/]/g, '_')}.cjs`);
  fs.writeFileSync(fixture, `require('${specifier}');\n`);

  const output = execFileSync(process.execPath, ['--import', counter, fixture], { encoding: 'utf8' });
  return (JSON.parse(output) as string[]).map(url => fileURLToPath(url)).filter(file => file !== fixture);
}

/** The package that `file` belongs to, for workspace and installed packages. */
function packageOf(file: string): string {
  const installed = file.split('/node_modules/').at(-1) as string;
  if (installed !== file) {
    const [scope, name] = installed.split('/');
    return scope?.startsWith('@') ? `${scope}/${name}` : (scope as string);
  }
  const workspace = file.match(/\/packages\/([^/]+)\//);
  return workspace ? `@sentry/${workspace[1]}` : file;
}

describe('@sentry/node startup', () => {
  test(`each Sentry package loads at most ${MAX_FILES_PER_PACKAGE} files`, () => {
    const counts: Record<string, number> = {};
    for (const file of loadedFiles('@sentry/node')) {
      const pkg = packageOf(file);
      if (pkg.startsWith('@sentry/')) {
        counts[pkg] = (counts[pkg] ?? 0) + 1;
      }
    }

    const tooMany = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > MAX_FILES_PER_PACKAGE));
    expect(tooMany).toEqual({});
  });
});
