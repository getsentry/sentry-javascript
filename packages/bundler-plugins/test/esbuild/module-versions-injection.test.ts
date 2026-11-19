import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/esbuild';
import { createModuleVersionsProject, INJECTED_MODULES, runAndReadModules } from '../utils/module-versions-project';

describe('module versions injection (esbuild)', () => {
  let root: string;

  beforeEach(() => {
    root = createModuleVersionsProject();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function buildApp(platform: esbuild.Platform | undefined): Promise<string> {
    const outfile = path.join(root, 'dist', 'main.js');
    await esbuild.build({
      absWorkingDir: root,
      entryPoints: ['./entry.js'],
      bundle: true,
      platform,
      outfile,
      logLevel: 'silent',
      plugins: [sentryEsbuildPlugin({ telemetry: false, silent: true, release: { create: false } })],
    });
    return fs.readFileSync(outfile, 'utf8');
  }

  it("injects into builds with `platform: 'node'`", async () => {
    expect(runAndReadModules(await buildApp('node'))).toEqual(INJECTED_MODULES);
  });

  it.each([undefined, 'browser', 'neutral'] as const)('does not inject with platform %j', async platform => {
    expect(await buildApp(platform)).not.toContain('__SENTRY_SERVER_MODULES__');
  });
});
