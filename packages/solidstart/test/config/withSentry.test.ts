import type { Nitro } from 'nitropack';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withSentry } from '../../src/config';

const userDefinedNitroRollupBeforeHookMock = vi.fn();
const userDefinedNitroCloseHookMock = vi.fn();
const addInstrumentationFileToBuildMock = vi.fn();
const addSentryTopImportMock = vi.fn();

vi.mock('../../src/config/addInstrumentation', () => ({
  addInstrumentationFileToBuild: (...args: unknown[]) => addInstrumentationFileToBuildMock(...args),
  addSentryTopImport: (...args: unknown[]) => addSentryTopImportMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withSentry()', () => {
  const solidStartConfig = {
    middleware: './src/middleware.ts',
    server: {
      hooks: {
        close: userDefinedNitroCloseHookMock,
        'rollup:before': userDefinedNitroRollupBeforeHookMock,
      },
    },
  };
  const nitroOptions: Nitro = {
    options: {
      buildDir: '/path/to/buildDir',
      output: {
        serverDir: '/path/to/serverDir',
      },
      preset: 'vercel',
    },
  };
  const rollupConfig = { plugins: [] };

  function callSentryNitroModule(config: ReturnType<typeof withSentry>): { hookFn: (...args: unknown[]) => unknown } {
    const modules = (config?.server as { modules?: unknown[] })?.modules || [];
    const sentryModule = modules[modules.length - 1] as (nitro: Nitro) => void;
    let hookFn: (...args: unknown[]) => unknown = () => {};
    const fakeNitro = {
      ...nitroOptions,
      hooks: {
        hook: (_name: string, fn: (...args: unknown[]) => unknown) => {
          hookFn = fn;
        },
      },
    } as unknown as Nitro;
    sentryModule(fakeNitro);
    return { hookFn };
  }

  it('registers a nitro module that hooks into rollup:before to add the instrumentation file', async () => {
    const config = withSentry(solidStartConfig, {});
    const { hookFn } = callSentryNitroModule(config);
    await hookFn(nitroOptions, rollupConfig);
    expect(addInstrumentationFileToBuildMock).toHaveBeenCalledWith(nitroOptions);
  });

  it('does not override user-defined hooks in server.hooks', () => {
    const config = withSentry(solidStartConfig, {});
    expect(config?.server.hooks?.['rollup:before']).toBe(userDefinedNitroRollupBeforeHookMock);
    expect(config?.server.hooks?.close).toBe(userDefinedNitroCloseHookMock);
  });

  it('adds the instrumentation file as top level import when configured as top-level-import', async () => {
    const config = withSentry(solidStartConfig, { autoInjectServerSentry: 'top-level-import' });
    const { hookFn } = callSentryNitroModule(config);
    await hookFn(nitroOptions, rollupConfig);
    expect(addSentryTopImportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          buildDir: '/path/to/buildDir',
          output: {
            serverDir: '/path/to/serverDir',
          },
          preset: 'vercel',
        },
      }),
    );
  });

  it('does not add the instrumentation file as top level import if autoInjectServerSentry is undefined', async () => {
    const config = withSentry(solidStartConfig, { autoInjectServerSentry: undefined });
    const { hookFn } = callSentryNitroModule(config);
    await hookFn(nitroOptions, rollupConfig);
    expect(addSentryTopImportMock).not.toHaveBeenCalled();
  });

  it('adds the sentry solidstart vite plugin', () => {
    const config = withSentry(solidStartConfig, {
      project: 'project',
      org: 'org',
      authToken: 'token',
    });
    const names = config?.vite.plugins.flat().map((plugin: Plugin) => plugin.name);
    expect(names).toEqual([
      'sentry-solidstart-build-instrumentation-file',
      'sentry-vite-plugin',
      'sentry-solidstart-update-source-map-setting',
    ]);
  });

  it('extends the passed in vite config object', () => {
    const config = withSentry(
      {
        ...solidStartConfig,
        vite: {
          plugins: [{ name: 'my-test-plugin' }],
        },
      },
      {
        project: 'project',
        org: 'org',
        authToken: 'token',
      },
    );

    const names = config?.vite.plugins.flat().map((plugin: Plugin) => plugin.name);
    expect(names).toEqual([
      'sentry-solidstart-build-instrumentation-file',
      'sentry-vite-plugin',
      'sentry-solidstart-update-source-map-setting',
      'my-test-plugin',
    ]);
  });

  it('extends the passed in vite function config', () => {
    const config = withSentry(
      {
        ...solidStartConfig,
        vite() {
          return { plugins: [{ name: 'my-test-plugin' }] };
        },
      },
      {
        project: 'project',
        org: 'org',
        authToken: 'token',
      },
    );

    const names = config
      ?.vite()
      .plugins.flat()
      .map((plugin: Plugin) => plugin.name);
    expect(names).toEqual([
      'sentry-solidstart-build-instrumentation-file',
      'sentry-vite-plugin',
      'sentry-solidstart-update-source-map-setting',
      'my-test-plugin',
    ]);
  });

  it('preserves existing server modules', () => {
    const existingModule = vi.fn();
    const config = withSentry(
      {
        ...solidStartConfig,
        server: {
          ...solidStartConfig.server,
          modules: [existingModule],
        },
      },
      {},
    );
    const modules = (config?.server as { modules?: unknown[] })?.modules || [];
    expect(modules).toHaveLength(2);
    expect(modules[0]).toBe(existingModule);
    expect(typeof modules[1]).toBe('function');
  });
});
