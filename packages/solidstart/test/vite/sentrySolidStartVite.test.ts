import type { Plugin } from 'vite';
import * as bundlerPluginsVite from '@sentry/bundler-plugins/vite';
import { describe, expect, it, vi } from 'vitest';
import { sentrySolidStartVite } from '../../src/vite/sentrySolidStartVite';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

function getSentrySolidStartVitePlugins(options?: Parameters<typeof sentrySolidStartVite>[0]): Plugin[] {
  return sentrySolidStartVite(
    {
      project: 'project',
      org: 'org',
      authToken: 'token',
      ...options,
    },
    {},
  );
}

describe('sentrySolidStartVite()', () => {
  it('returns an array of vite plugins', () => {
    const plugins = getSentrySolidStartVitePlugins();
    const names = plugins.map(plugin => plugin.name);
    expect(names).toEqual([
      'sentry-solidstart-tunnel-base-path',
      'sentry-solidstart-build-instrumentation-file',
      'sentry-vite-plugin',
      'sentry-vite-upload-staging',
      'sentry-solidstart-update-source-map-setting',
    ]);
  });

  it("only adds the bundler plugin for module versions if source maps upload isn't enabled", () => {
    const sentryVitePluginSpy = vi.spyOn(bundlerPluginsVite, 'sentryVitePlugin');
    sentryVitePluginSpy.mockClear();

    const plugins = getSentrySolidStartVitePlugins({ sourcemaps: { disable: true }, debug: true });
    const names = plugins.map(plugin => plugin.name);
    expect(names).toEqual([
      'sentry-solidstart-tunnel-base-path',
      'sentry-solidstart-build-instrumentation-file',
      'sentry-vite-plugin',
      'sentry-vite-upload-staging',
    ]);
    expect(sentryVitePluginSpy).toHaveBeenCalledWith({
      debug: true,
      telemetry: false,
      sourcemaps: { upload: false, injectDebugIds: false },
      release: { inject: false, create: false, finalize: false, setCommits: false, deploy: false },
    });
  });

  it('returns only build-instrumentation-file plugin if `NODE_ENV` is development', async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const plugins = getSentrySolidStartVitePlugins({ sourcemaps: { disable: false } });
    const names = plugins.map(plugin => plugin.name);
    expect(names).toEqual(['sentry-solidstart-tunnel-base-path', 'sentry-solidstart-build-instrumentation-file']);

    process.env.NODE_ENV = previousEnv;
  });
});
