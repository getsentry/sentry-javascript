import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryTanstackStart } from '../../src/vite/sentryTanstackStart';

const mockSourceMapsConfigPlugin: Plugin = {
  name: 'sentry-tanstackstart-source-maps-config',
  apply: 'build',
  enforce: 'pre',
  config: vi.fn(),
};

const mockSentryVitePlugin: Plugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

const mockEnableSourceMapsPlugin: Plugin = {
  name: 'sentry-tanstackstart-react-source-maps',
  apply: 'build',
  enforce: 'post',
  config: vi.fn(),
};

vi.mock('../../src/vite/sourceMaps', () => ({
  makeAddSentryVitePlugin: vi.fn(() => [mockSourceMapsConfigPlugin, mockSentryVitePlugin]),
  makeEnableSourceMapsVitePlugin: vi.fn(() => [mockEnableSourceMapsPlugin]),
}));

describe('sentryTanstackStart()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('returns plugins in production mode', () => {
    const plugins = sentryTanstackStart({ org: 'test-org' });

    // Should have plugins from makeAddSentryVitePlugin + makeEnableSourceMapsVitePlugin
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('returns empty array in development mode', () => {
    process.env.NODE_ENV = 'development';

    const plugins = sentryTanstackStart({ org: 'test-org' });

    expect(plugins).toHaveLength(0);
  });

  it('returns empty array when sourcemaps.disable is true', () => {
    const plugins = sentryTanstackStart({
      sourcemaps: { disable: true },
    });

    expect(plugins).toHaveLength(0);
  });

  it('returns empty array when sourcemaps.disable is "disable-upload"', () => {
    const plugins = sentryTanstackStart({
      sourcemaps: { disable: 'disable-upload' },
    });

    expect(plugins).toHaveLength(0);
  });

  it('returns plugins when sourcemaps.disable is false', () => {
    const plugins = sentryTanstackStart({
      sourcemaps: { disable: false },
    });

    expect(plugins.length).toBeGreaterThan(0);
  });

  it('returns plugins by default when sourcemaps is not specified', () => {
    const plugins = sentryTanstackStart({});

    expect(plugins.length).toBeGreaterThan(0);
  });

  it('includes source maps config plugin from makeAddSentryVitePlugin', () => {
    const plugins = sentryTanstackStart({});

    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-source-maps-config');
    expect(configPlugin).toBeDefined();
  });

  it('includes enable source maps plugin from makeEnableSourceMapsVitePlugin', () => {
    const plugins = sentryTanstackStart({});

    const enablePlugin = plugins.find(p => p.name === 'sentry-tanstackstart-react-source-maps');
    expect(enablePlugin).toBeDefined();
  });
});
