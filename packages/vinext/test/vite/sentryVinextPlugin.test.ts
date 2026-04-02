import { describe, expect, it, vi } from 'vitest';
import { sentryVinext } from '../../src/vite/sentryVinextPlugin';

// Mock the sentry vite plugin
vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi.fn().mockResolvedValue([{ name: 'sentry-vite-plugin' }]),
}));

describe('sentryVinext', () => {
  it('returns an array of plugins', async () => {
    const plugins = await sentryVinext();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('includes auto-instrumentation plugin by default', async () => {
    const plugins = await sentryVinext();
    const autoPlugin = plugins.find(p => p.name === 'sentry-vinext-auto-instrumentation');
    expect(autoPlugin).toBeDefined();
  });

  it('includes source map settings plugin', async () => {
    const plugins = await sentryVinext();
    const sourceMapPlugin = plugins.find(p => p.name === 'sentry-vinext-source-map-settings');
    expect(sourceMapPlugin).toBeDefined();
  });

  it('can disable auto-instrumentation', async () => {
    const plugins = await sentryVinext({ autoInstrument: false });
    const autoPlugin = plugins.find(p => p.name === 'sentry-vinext-auto-instrumentation');
    expect(autoPlugin).toBeUndefined();
  });

  it('source map settings plugin enables hidden source maps when not set', async () => {
    const plugins = await sentryVinext();
    const sourceMapPlugin = plugins.find(p => p.name === 'sentry-vinext-source-map-settings')!;

    const configHook = (sourceMapPlugin as any).config;
    const result = configHook({ build: {} });

    expect(result.build.sourcemap).toBe('hidden');
  });

  it('source map settings plugin preserves existing source map setting', async () => {
    const plugins = await sentryVinext();
    const sourceMapPlugin = plugins.find(p => p.name === 'sentry-vinext-source-map-settings')!;

    const configHook = (sourceMapPlugin as any).config;
    const inputConfig = { build: { sourcemap: true } };
    const result = configHook(inputConfig);

    // When source maps are already configured, the plugin returns the original config unchanged
    expect(result).toBe(inputConfig);
  });

  it('source map settings plugin preserves disabled source maps', async () => {
    const plugins = await sentryVinext();
    const sourceMapPlugin = plugins.find(p => p.name === 'sentry-vinext-source-map-settings')!;

    const configHook = (sourceMapPlugin as any).config;
    const inputConfig = { build: { sourcemap: false } };
    const result = configHook(inputConfig);

    // When source maps are explicitly disabled, the plugin returns the original config unchanged
    expect(result).toBe(inputConfig);
  });
});
