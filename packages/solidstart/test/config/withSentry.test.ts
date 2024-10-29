import type { Nitro } from 'nitropack';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RollupConfig } from '../../build/types/config/types';
import { withSentry } from '../../src/config';

const userDefinedNitroRollupBeforeHookMock = vi.fn();
const userDefinedNitroCloseHookMock = vi.fn();
const addInstrumentationFileToBuildMock = vi.fn();
const addAutoInstrumentationMock = vi.fn();

vi.mock('../../src/config/addInstrumentation', () => ({
  addInstrumentationFileToBuild: (...args: unknown[]) => addInstrumentationFileToBuildMock(...args),
  addAutoInstrumentation: (...args: unknown[]) => addAutoInstrumentationMock(...args),
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
  const rollupConfig: RollupConfig = {
    plugins: [],
  };

  it('adds a nitro hook to auto instrumentation the backend', async () => {
    const config = withSentry(solidStartConfig);
    await config?.server.hooks['rollup:before'](nitroOptions, rollupConfig);
    expect(addAutoInstrumentationMock).toHaveBeenCalledWith(nitroOptions, rollupConfig);
  });

  it('adds a nitro hook to add the instrumentation file to the build if auto instrumentation is turned off', async () => {
    const config = withSentry(solidStartConfig, { autoInstrument: false });
    await config?.server.hooks['rollup:before'](nitroOptions);
    expect(addInstrumentationFileToBuildMock).toHaveBeenCalledWith(nitroOptions);
    expect(userDefinedNitroRollupBeforeHookMock).toHaveBeenCalledWith(nitroOptions);
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
