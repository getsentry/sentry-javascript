import type { Nitro } from 'nitro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNitroOptions } from '../src/config';
import { setupSourceMaps } from '../src/sourceMaps';

const manager = vi.hoisted(() => ({
  telemetry: { emitBundlerPluginExecutionSignal: vi.fn().mockResolvedValue(undefined) },
  createRelease: vi.fn().mockResolvedValue(undefined),
  injectDebugIds: vi.fn().mockResolvedValue(undefined),
  uploadSourcemaps: vi.fn().mockResolvedValue(undefined),
  deleteArtifacts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sentry/bundler-plugins/core', () => ({
  createSentryBuildPluginManager: vi.fn(() => manager),
}));

/** Runs the `compiled` hook that `setupSourceMaps` registers, if any. */
async function runBuild(options: SentryNitroOptions, sourcemap?: boolean | 'hidden' | 'inline'): Promise<boolean> {
  const hooks: ((nitro: Nitro) => Promise<void>)[] = [];
  const nitro = {
    options: { dev: false, sourcemap, output: { serverDir: '/output/server' } },
    hooks: { hook: (_name: string, hook: (nitro: Nitro) => Promise<void>) => hooks.push(hook) },
  } as unknown as Nitro;

  setupSourceMaps(nitro, options, true);
  await Promise.all(hooks.map(hook => hook(nitro)));
  return hooks.length > 0;
}

describe('the `compiled` hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads and deletes by default', async () => {
    await runBuild({});

    expect(manager.createRelease).toHaveBeenCalledTimes(1);
    expect(manager.injectDebugIds).toHaveBeenCalledWith(['/output/server']);
    expect(manager.uploadSourcemaps).toHaveBeenCalledTimes(1);
    expect(manager.deleteArtifacts).toHaveBeenCalledTimes(1);
  });

  it.each([{ upload: false }, { injectDebugIds: false }, { disable: 'disable-upload' }] as const)(
    'creates the release but uploads and deletes nothing with %j',
    async sourcemaps => {
      await runBuild({ sourcemaps });

      expect(manager.createRelease).toHaveBeenCalledTimes(1);
      expect(manager.uploadSourcemaps).not.toHaveBeenCalled();
      expect(manager.deleteArtifacts).not.toHaveBeenCalled();
    },
  );

  it('deletes without an upload with `delete: true`', async () => {
    await runBuild({ sourcemaps: { upload: false, delete: true } });

    expect(manager.uploadSourcemaps).not.toHaveBeenCalled();
    expect(manager.deleteArtifacts).toHaveBeenCalledTimes(1);
  });

  // Nitro resolves an unset `sourcemap` to `false`, so this is also `upload: false` without a source map setting.
  it.each([
    [{}, false],
    [{ upload: false }, false],
    [{ upload: false, delete: true }, false],
    [{}, 'inline'],
  ] as const)(
    'creates the release but skips the source map steps with %j and `sourcemap: %s`',
    async (sourcemaps, sourcemap) => {
      await runBuild({ sourcemaps }, sourcemap);

      expect(manager.createRelease).toHaveBeenCalledTimes(1);
      expect(manager.injectDebugIds).not.toHaveBeenCalled();
      expect(manager.uploadSourcemaps).not.toHaveBeenCalled();
      expect(manager.deleteArtifacts).not.toHaveBeenCalled();
    },
  );

  it('does not run with `disable: true`', async () => {
    await expect(runBuild({ sourcemaps: { disable: true } })).resolves.toBe(false);
  });
});
