import { describe, expect, it } from 'vitest';
import { sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/vite';
import { INSTRUMENTED_MODULE_NAMES } from '../../src/orchestrion/config';

function getMarkerPlugin() {
  const plugins = sentryOrchestrionPlugin();
  const marker = plugins.find(p => p.name === 'sentry-orchestrion-marker');
  expect(marker).toBeDefined();
  return marker;
}

// The optimizer names the transformer plugin `code-transformer`, both flavors.
function optimizerPluginNames(marker: AnyPlugin, meta?: { rolldownVersion?: string }): string[] {
  const result = marker.configEnvironment.call({ meta }, 'ssr');
  const opts = result?.optimizeDeps ?? {};
  const plugins = opts.rolldownOptions?.plugins ?? opts.esbuildOptions?.plugins ?? [];
  return plugins.map((p: { name: string }) => p.name);
}

describe('sentryOrchestrionPlugin', () => {
  it('returns the marker plugin and the code transformer', () => {
    const plugins = sentryOrchestrionPlugin();
    expect(plugins.map(p => p.name)).toContain('sentry-orchestrion-marker');
    expect(plugins.map(p => p.name)).toContain('code-transformer');
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

  describe('configEnvironment (dev dep-optimizer instrumentation)', () => {
    it('adds the esbuild transformer for server environments on classic Vite', () => {
      // No `meta.rolldownVersion` → esbuild-based optimizer.
      expect(optimizerPluginNames(getMarkerPlugin())).toContain('code-transformer');
      const result = getMarkerPlugin().configEnvironment.call({ meta: {} }, 'ssr');
      expect(result.optimizeDeps.esbuildOptions).toBeDefined();
      expect(result.optimizeDeps.rolldownOptions).toBeUndefined();
    });

    it('adds the rollup transformer via rolldownOptions on Vite 8 / Rolldown', () => {
      const marker = getMarkerPlugin();
      const result = marker.configEnvironment.call({ meta: { rolldownVersion: '1.1.5' } }, 'ssr');
      expect(result.optimizeDeps.rolldownOptions).toBeDefined();
      expect(result.optimizeDeps.esbuildOptions).toBeUndefined();
      expect(result.optimizeDeps.rolldownOptions.plugins.map((p: { name: string }) => p.name)).toContain(
        'code-transformer',
      );
    });

    it('does not instrument the client environment', () => {
      expect(getMarkerPlugin().configEnvironment.call({ meta: {} }, 'client')).toBeUndefined();
    });
  });
});
