import type { Nuxt } from '@nuxt/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import { handleBuildDoneHook } from '../../src/vite/buildEndUploadHook';

vi.mock('node:fs');
vi.mock('../../src/vite/sourceMaps');
vi.mock('@sentry/bundler-plugin-core');

describe('handleBuildDoneHook', () => {
  let mockNuxt: Nuxt;
  let mockSentryBuildPluginManager: any;
  let mockCreateRelease: ReturnType<typeof vi.fn>;
  let mockUploadSourcemaps: ReturnType<typeof vi.fn>;
  let mockInjectDebugIds: ReturnType<typeof vi.fn>;
  let mockDeleteArtifacts: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCreateRelease = vi.fn().mockResolvedValue(undefined);
    mockUploadSourcemaps = vi.fn().mockResolvedValue(undefined);
    mockInjectDebugIds = vi.fn().mockResolvedValue(undefined);
    mockDeleteArtifacts = vi.fn().mockResolvedValue(undefined);

    mockSentryBuildPluginManager = {
      createRelease: mockCreateRelease,
      uploadSourcemaps: mockUploadSourcemaps,
      injectDebugIds: mockInjectDebugIds,
      deleteArtifacts: mockDeleteArtifacts,
      telemetry: {
        emitBundlerPluginExecutionSignal: vi.fn().mockResolvedValue(undefined),
      },
    };

    const { createSentryBuildPluginManager } = await import('@sentry/bundler-plugin-core');
    vi.mocked(createSentryBuildPluginManager).mockReturnValue(mockSentryBuildPluginManager);

    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const { getPluginOptions } = await import('../../src/vite/sourceMaps');
    vi.mocked(getPluginOptions).mockReturnValue({});

    mockNuxt = {
      options: {
        rootDir: '/test',
        nitro: { output: { dir: '/test/.output' } },
      },
    } as any;
  });

  it('should create release even when source maps are disabled', async () => {
    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: true },
    };

    await handleBuildDoneHook(options, mockNuxt, undefined);

    expect(mockCreateRelease).toHaveBeenCalledTimes(1);
    expect(mockInjectDebugIds).not.toHaveBeenCalled();
    expect(mockUploadSourcemaps).not.toHaveBeenCalled();
  });

  it('should upload source maps when enabled', async () => {
    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: false },
    };

    await handleBuildDoneHook(options, mockNuxt, undefined);

    expect(mockCreateRelease).toHaveBeenCalledTimes(1);
    expect(mockInjectDebugIds).toHaveBeenCalledWith(['/test/.output']);
    expect(mockUploadSourcemaps).toHaveBeenCalledWith(['/test/.output'], { prepareArtifacts: false });
    expect(mockDeleteArtifacts).toHaveBeenCalledTimes(1);
  });

  it('should add node_modules to ignore patterns when source maps are enabled', async () => {
    const { createSentryBuildPluginManager } = await import('@sentry/bundler-plugin-core');
    const { getPluginOptions } = await import('../../src/vite/sourceMaps');

    vi.mocked(getPluginOptions).mockReturnValue({});

    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: false },
    };

    await handleBuildDoneHook(options, mockNuxt, undefined);

    const pluginOptions = vi.mocked(createSentryBuildPluginManager).mock.calls[0]?.[0];

    expect(pluginOptions?.sourcemaps?.ignore).toEqual(['**/node_modules/**', '**/node_modules/**/*.map']);
  });

  it('should not add node_modules patterns when source maps are disabled', async () => {
    const { createSentryBuildPluginManager } = await import('@sentry/bundler-plugin-core');
    const { getPluginOptions } = await import('../../src/vite/sourceMaps');

    vi.mocked(getPluginOptions).mockReturnValue({});

    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: true },
    };

    await handleBuildDoneHook(options, mockNuxt, undefined);

    const pluginOptions = vi.mocked(createSentryBuildPluginManager).mock.calls[0]?.[0];

    expect(pluginOptions?.sourcemaps?.ignore).toBeUndefined();
  });

  it('should not log source map related messages when source maps are disabled', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: true },
      debug: true,
    };

    await handleBuildDoneHook(options, mockNuxt, undefined);

    const allLogs = consoleLogSpy.mock.calls.map(call => call.join(' '));

    const alwaysShownLogsStrings = [
      '[Sentry] Nuxt build ended. Starting to upload build-time info to Sentry (release, source maps)...',
      '[Sentry] Source map upload is disabled. Skipping debugID injection and source map upload steps.',
    ];

    const loggedGeneralLogs = allLogs.filter(log => alwaysShownLogsStrings.includes(log));

    const loggedSourceMapLogs = allLogs.filter(log => {
      const lowerCaseLog = log.toLowerCase();

      if (alwaysShownLogsStrings.map(log => log.toLowerCase()).includes(lowerCaseLog)) {
        return false;
      }

      return lowerCaseLog.includes('source map') || lowerCaseLog.includes('sourcemap');
    });

    expect(loggedGeneralLogs).toHaveLength(2);
    expect(loggedSourceMapLogs).toHaveLength(0);

    consoleLogSpy.mockRestore();
  });

  it('should pass shouldDeleteFilesFallback to getPluginOptions', async () => {
    const { getPluginOptions } = await import('../../src/vite/sourceMaps');

    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: false },
    };

    const shouldDeleteFilesFallback = { client: true, server: false };

    await handleBuildDoneHook(options, mockNuxt, shouldDeleteFilesFallback);

    expect(getPluginOptions).toHaveBeenCalledWith(options, shouldDeleteFilesFallback);
  });

  it('should pass undefined shouldDeleteFilesFallback when not provided', async () => {
    const { getPluginOptions } = await import('../../src/vite/sourceMaps');

    const options: SentryNuxtModuleOptions = {
      sourcemaps: { disable: false },
    };

    await handleBuildDoneHook(options, mockNuxt, undefined);

    expect(getPluginOptions).toHaveBeenCalledWith(options, undefined);
  });
});
