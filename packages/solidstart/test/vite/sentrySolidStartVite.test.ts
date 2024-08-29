import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { sentrySolidStartVite } from '../../src/vite/sentrySolidStartVite';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

function getSentrySolidStartVitePlugins(options?: Parameters<typeof sentrySolidStartVite>[0]): Plugin[] {
  return sentrySolidStartVite({
    project: 'project',
    org: 'org',
    authToken: 'token',
    ...options,
  });
}

describe('sentrySolidStartVite()', () => {
  it('returns an array of vite plugins', () => {
    const plugins = getSentrySolidStartVitePlugins();
    const names = plugins.map(plugin => plugin.name);
    expect(names).toEqual([
      'sentry-solidstart-source-maps',
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
      'sentry-debug-id-upload-plugin',
      'sentry-vite-debug-id-injection-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
    ]);
  });

  it("returns an empty array if source maps upload isn't enabled", () => {
    const plugins = getSentrySolidStartVitePlugins({ sourceMapsUploadOptions: { enabled: false } });
    expect(plugins).toHaveLength(0);
  });

  it('returns an empty array if `NODE_ENV` is development', async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const plugins = getSentrySolidStartVitePlugins({ sourceMapsUploadOptions: { enabled: true } });
    expect(plugins).toHaveLength(0);

    process.env.NODE_ENV = previousEnv;
  });
});
