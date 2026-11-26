import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bin } from '../../package.json';

const CLI = path.resolve(__dirname, '../../scripts/cli.mjs');

describe('cli', () => {
  let binDir: string;

  beforeAll(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-remix-cli-'));
    for (const name of Object.keys(bin)) {
      fs.symlinkSync(CLI, path.join(binDir, name));
    }
  });

  afterAll(() => {
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  function run(file: string, ...args: string[]): string {
    const { stdout, stderr } = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', cwd: binDir });
    return stdout + stderr;
  }

  it('has a single bin target so that `npx @sentry/remix` can resolve it', () => {
    expect(new Set(Object.values(bin))).toEqual(new Set(['scripts/cli.mjs']));
  });

  it('runs the classic script by default', () => {
    expect(run(path.join(binDir, 'sentry-upload-sourcemaps'), '--upload-sourcemaps', '--help')).toContain(
      'Usage: npx @sentry/remix --upload-sourcemaps',
    );
  });

  it('runs the Remix 3 script through its bin name', () => {
    expect(run(path.join(binDir, 'sentry-remix-v3-upload-sourcemaps'))).toContain('at least one --entry is required');
  });

  it.each([['--entry', 'app/entry.ts'], ['--entry=app/entry.ts']])(
    'runs the Remix 3 script for `%s` when the bin name is lost',
    (...args) => {
      expect(run(CLI, ...args, '--unknown')).toContain("[sentry] Unknown option '--unknown'");
    },
  );
});
