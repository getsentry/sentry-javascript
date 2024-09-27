import type { Plugin } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nitro } from '../../src/config';
import { withSentry } from '../../src/config';

const userDefinedNitroRollupBeforeHookMock = vi.fn();
const userDefinedNitroCloseHookMock = vi.fn();
const addInstrumentationFileToBuildMock = vi.fn();
const experimental_addInstrumentationFileTopLevelImportToServerEntryMock = vi.fn();

vi.mock('../../src/config/addInstrumentation', () => ({
  addInstrumentationFileToBuild: (...args: unknown[]) => addInstrumentationFileToBuildMock(...args),
  experimental_addInstrumentationFileTopLevelImportToServerEntry: (...args: unknown[]) =>
    experimental_addInstrumentationFileTopLevelImportToServerEntryMock(...args),
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

  it('adds a nitro hook to add the instrumentation file to the build', async () => {
    const config = withSentry(solidStartConfig);
    await config?.server.hooks['rollup:before'](nitroOptions);
    expect(addInstrumentationFileToBuildMock).toHaveBeenCalledWith(nitroOptions);
    expect(userDefinedNitroRollupBeforeHookMock).toHaveBeenCalledWith(nitroOptions);
  });

  it('adds a nitro hook to add the instrumentation file as top level import to the server entry file', async () => {
    const config = withSentry(solidStartConfig, { experimental_basicServerTracing: true });
    await config?.server.hooks['rollup:before'](nitroOptions);
    await config?.server.hooks['close'](nitroOptions);
    expect(experimental_addInstrumentationFileTopLevelImportToServerEntryMock).toHaveBeenCalledWith(
      '/path/to/serverDir',
      'vercel',
    );
    expect(userDefinedNitroCloseHookMock).toHaveBeenCalled();
  });

  it('does not add the instrumentation file as top level import if experimental flag was not true', async () => {
    const config = withSentry(solidStartConfig, { experimental_basicServerTracing: false });
    await config?.server.hooks['rollup:before'](nitroOptions);
    await config?.server.hooks['close'](nitroOptions);
    expect(experimental_addInstrumentationFileTopLevelImportToServerEntryMock).not.toHaveBeenCalled();
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
      'sentry-solidstart-source-maps',
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
      'sentry-debug-id-upload-plugin',
      'sentry-vite-debug-id-injection-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
      'sentry-solidstart-build-instrumentation-file',
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
      'sentry-solidstart-source-maps',
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
      'sentry-debug-id-upload-plugin',
      'sentry-vite-debug-id-injection-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
      'sentry-solidstart-build-instrumentation-file',
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
      'sentry-solidstart-source-maps',
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
      'sentry-debug-id-upload-plugin',
      'sentry-vite-debug-id-injection-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
      'sentry-solidstart-build-instrumentation-file',
      'my-test-plugin',
    ]);
  });
});
