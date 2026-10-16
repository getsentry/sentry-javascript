import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { rollup } from 'rollup';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';

const upload = vi.hoisted(() => vi.fn());
const fixtures: string[] = [];
vi.mock('sentry', () => ({
  createSentrySDK: () => ({
    sourcemap: { upload },
    release: {},
  }),
}));

beforeEach(() => {
  upload.mockReset();
});

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test.each([
  { name: 'ordinary filenames', file: 'sdk.mjs', explicitAssets: false, nativePath: false },
  { name: 'glob characters in detected paths', file: 'sdk+[...].mjs', explicitAssets: false, nativePath: false },
  { name: 'explicit asset globs', file: 'sdk+[...].mjs', explicitAssets: true, nativePath: false },
  { name: 'native path separators', file: 'sdk+[...].mjs', explicitAssets: false, nativePath: true },
  { name: 'ignored assets', file: 'sdk+[...].mjs', explicitAssets: false, nativePath: false, ignored: true },
])('handles $name when uploading Rollup artifacts', async ({ file, explicitAssets, nativePath, ignored }) => {
  const fixture = mkdtempSync(join(tmpdir(), 'sentry-rollup-literal-paths-'));
  fixtures.push(fixture);
  const input = join(fixture, 'input.js');
  const output = join(fixture, 'dist', '_libs', file);
  writeFileSync(input, 'export function example() { throw new Error("original fixture"); }\n');
  const uploadedFiles: string[] = [];
  upload.mockImplementation(async (options: { directory: string }) => {
    uploadedFiles.push(...readdirSync(options.directory));
  });

  const bundle = await rollup({
    input,
    plugins: sentryRollupPlugin({
      authToken: 'local-fixture-only',
      org: 'local-fixture',
      project: 'local-fixture',
      telemetry: false,
      silent: true,
      release: { create: false, finalize: false },
      sourcemaps: {
        assets: explicitAssets ? join(fixture, 'dist', '**', '*.mjs').split(sep).join('/') : undefined,
        ignore: ignored ? join(fixture, 'dist', '**', 'sdk+*.mjs').split(sep).join('/') : undefined,
      },
    }),
  });
  try {
    await bundle.write({ file: nativePath ? output : output.replace(/\\/g, '/'), format: 'es', sourcemap: true });
  } finally {
    await bundle.close();
  }

  expect(existsSync(output)).toBe(true);
  expect(existsSync(`${output}.map`)).toBe(true);
  expect(readFileSync(output, 'utf8')).toContain('sentry-dbid-');
  expect(uploadedFiles.filter(name => name.endsWith('.js'))).toHaveLength(ignored ? 0 : 1);
  expect(uploadedFiles.filter(name => name.endsWith('.js.map'))).toHaveLength(ignored ? 0 : 1);
});
