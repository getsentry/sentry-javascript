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

  it('adds a nitro hook to add the instrumentation file to the build if no plugin options are provided', async () => {
    const config = withSentry(solidStartConfig, {});
    await config?.server.hooks['rollup:before'](nitroOptions);
    expect(addInstrumentationFileToBuildMock).toHaveBeenCalledWith(nitroOptions);
    expect(userDefinedNitroRollupBeforeHookMock).toHaveBeenCalledWith(nitroOptions);
  });

  it('adds a nitro hook to add the instrumentation file as top level import to the server entry file when configured in autoInjectServerSentry', async () => {
    const config = withSentry(solidStartConfig, { autoInjectServerSentry: 'top-level-import' });
    await config?.server.hooks['rollup:before'](nitroOptions);
    await config?.server.hooks['close'](nitroOptions);
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
    expect(userDefinedNitroCloseHookMock).toHaveBeenCalled();
  });

  it('does not add the instrumentation file as top level import if autoInjectServerSentry is undefined', async () => {
    const config = withSentry(solidStartConfig, { autoInjectServerSentry: undefined });
    await config?.server.hooks['rollup:before'](nitroOptions);
    await config?.server.hooks['close'](nitroOptions);
    expect(addSentryTopImportMock).not.toHaveBeenCalled();
    expect(userDefinedNitroCloseHookMock).toHaveBeenCalled();
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
      'sentry-telemetry-plugin',
      'sentry-vite-injection-plugin',
      'sentry-release-management-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
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
      'sentry-telemetry-plugin',
      'sentry-vite-injection-plugin',
      'sentry-release-management-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
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
      'sentry-telemetry-plugin',
      'sentry-vite-injection-plugin',
      'sentry-release-management-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
      'sentry-solidstart-update-source-map-setting',
      'my-test-plugin',
    ]);
  });
});
