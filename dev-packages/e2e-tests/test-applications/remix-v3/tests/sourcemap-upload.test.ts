import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

const DEBUG_ID = /\/\/# debugId=([0-9a-f-]{36})/;

// Not a listed subpath, so it is reached from the package root.
const script = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@sentry/remix/package.json')),
  'scripts',
  'sentry-remix-v3-upload-sourcemaps.mjs',
);

test('emits the module graph with one map per module, all sharing the served debug IDs', async ({ baseURL }) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remix-v3-upload-'));

  const output = execFileSync(
    'node',
    [
      '--import',
      '@sentry/remix/v3/node',
      script,
      '--entry',
      'app/actions/public/entry.ts',
      '--dry-run',
      '--out-dir',
      outDir,
    ],
    { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' },
  );
  expect(output).toMatch(/emitted \d+ modules/);

  const modules = walk(outDir).filter(file => !file.endsWith('.map'));
  expect(modules.length).toBeGreaterThan(1);

  for (const file of modules) {
    const debugId = fs.readFileSync(file, 'utf8').match(DEBUG_ID)?.[1];
    expect(debugId, `${file} has no debug ID`).toBeDefined();
    const map = JSON.parse(fs.readFileSync(`${file}.map`, 'utf8')) as { debugId?: string };
    expect(map.debugId, `${file}.map does not match its module`).toBe(debugId);
  }

  // The IDs are hashed from the compiled source, so the emitted entry must match what the server
  // serves right now. That is what lets an upload made in CI symbolicate a running app.
  const emittedEntry = modules.find(file => file.endsWith(path.join('app', 'actions', 'public', 'entry.ts')));
  const served = await (await fetch(`${baseURL}/assets/app/actions/public/entry.ts`)).text();
  expect(fs.readFileSync(emittedEntry as string, 'utf8').match(DEBUG_ID)?.[1]).toBe(served.match(DEBUG_ID)?.[1]);

  fs.rmSync(outDir, { recursive: true, force: true });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
