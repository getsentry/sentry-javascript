import { describe, expect, it } from 'vitest';
import { sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/vite';
import { INSTRUMENTED_MODULE_NAMES } from '../../src/orchestrion/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = any;

function getMarkerPlugin(): AnyPlugin {
  const plugins = sentryOrchestrionPlugin();
  const marker = plugins.find((p: AnyPlugin) => p.name === 'sentry-orchestrion-marker');
  expect(marker).toBeDefined();
  return marker;
}

describe('sentryOrchestrionPlugin', () => {
  it('returns the marker plugin and the code transformer', () => {
    const plugins = sentryOrchestrionPlugin();
    expect(plugins.map((p: AnyPlugin) => p.name)).toContain('sentry-orchestrion-marker');
    expect(plugins.map((p: AnyPlugin) => p.name)).toContain('code-transformer');
  });

  it('force-bundles instrumented packages via ssr.noExternal', () => {
    const marker = getMarkerPlugin();
    expect(marker.config()).toEqual({ ssr: { noExternal: INSTRUMENTED_MODULE_NAMES } });
  });

  it('prepends the bundler marker banner to entry chunks', () => {
    const marker = getMarkerPlugin();
    const result = marker.renderChunk('console.log("app");', { isEntry: true });
    expect(result.code).toContain('globalThis.__SENTRY_ORCHESTRION__.bundler = true;');
    expect(result.map).toBeDefined();
    expect(marker.renderChunk('console.log("chunk");', { isEntry: false })).toBeNull();
  });

  describe('configEnvironment (dev dep pre-bundling)', () => {
    it('registers the esbuild code transformer for non-client environments', () => {
      const marker = getMarkerPlugin();
      const result = marker.configEnvironment('worker');
      const plugins = result?.optimizeDeps?.esbuildOptions?.plugins;
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('code-transformer');
      expect(typeof plugins[0].setup).toBe('function');
    });

    it('leaves the client environment alone', () => {
      const marker = getMarkerPlugin();
      expect(marker.configEnvironment('client')).toBeUndefined();
    });
  });
});
