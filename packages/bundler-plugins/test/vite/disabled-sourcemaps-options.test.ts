import * as fs from 'fs';
import * as path from 'path';
import { createBuilder } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisabledSourcemapsOptions } from '../../src/core';
import { sentryVitePlugin } from '../../src/vite';
import { createModuleVersionsProject, INJECTED_MODULES, runAndReadModules } from '../utils/module-versions-project';

const { sdk } = vi.hoisted(() => ({
  sdk: {
    release: { create: vi.fn(), finalize: vi.fn(), 'set-commits': vi.fn(), deploy: vi.fn() },
    sourcemap: { upload: vi.fn(), inject: vi.fn() },
    run: vi.fn(),
  },
}));

vi.mock('sentry', () => ({ createSentrySDK: () => sdk }));

function readFiles(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter(file => fs.statSync(path.join(dir, file)).isFile())
      .map(file => [file, fs.readFileSync(path.join(dir, file), 'utf8')]),
  );
}

describe('getDisabledSourcemapsOptions (vite)', () => {
  let root: string;

  beforeEach(() => {
    root = createModuleVersionsProject();
    vi.stubEnv('SENTRY_RELEASE', '1.2.3');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['without credentials', { SENTRY_AUTH_TOKEN: undefined }],
    // Credentials in the environment must not make the plugin create a release or upload anything.
    [
      'with credentials in the environment',
      { SENTRY_AUTH_TOKEN: 'token', SENTRY_ORG: 'org', SENTRY_PROJECT: 'project' },
    ],
  ])('only injects module versions into the server build %s', async (_, env: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }
    const warn = vi.spyOn(console, 'warn');
    const info = vi.spyOn(console, 'info');
    const clientOutDir = path.join(root, 'dist', 'client');
    const serverOutDir = path.join(root, 'dist', 'server');

    const builder = await createBuilder({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: sentryVitePlugin(getDisabledSourcemapsOptions()),
      environments: {
        client: { build: { outDir: clientOutDir, rollupOptions: { input: path.join(root, 'entry.js') } } },
        ssr: {
          build: {
            outDir: serverOutDir,
            ssr: path.join(root, 'entry.js'),
            rollupOptions: { output: { format: 'cjs' } },
          },
        },
      },
    });
    await builder.buildApp();

    const clientFiles = readFiles(clientOutDir);
    const serverFiles = readFiles(serverOutDir);
    const allCode = Object.values({ ...clientFiles, ...serverFiles }).join('\n');

    expect(runAndReadModules(Object.values(serverFiles).join('\n'))).toEqual(INJECTED_MODULES);
    expect(runAndReadModules(Object.values(clientFiles).join('\n'))).toBeUndefined();
    expect(Object.keys({ ...clientFiles, ...serverFiles }).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(allCode).not.toContain('SENTRY_RELEASE');
    expect(allCode).not.toContain('sentry-dbid');
    expect(sdk.release.create).not.toHaveBeenCalled();
    expect(sdk.release.finalize).not.toHaveBeenCalled();
    expect(sdk.release['set-commits']).not.toHaveBeenCalled();
    expect(sdk.release.deploy).not.toHaveBeenCalled();
    expect(sdk.sourcemap.upload).not.toHaveBeenCalled();
    expect(sdk.sourcemap.inject).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
