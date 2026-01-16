import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryTanstackStart } from '../../src/vite/sentryTanstackStart';

const mockSourceMapsConfigPlugin: Plugin = {
  name: 'sentry-tanstackstart-files-to-delete-after-upload-plugin',
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

    expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockEnableSourceMapsPlugin]);
  });

  it('returns no plugins in development mode', () => {
    process.env.NODE_ENV = 'development';

    const plugins = sentryTanstackStart({ org: 'test-org' });

    expect(plugins).toEqual([]);
  });

  it('returns Sentry Vite plugins but not enable source maps plugin when sourcemaps.disable is true', () => {
    const plugins = sentryTanstackStart({
      sourcemaps: { disable: true },
    });

    expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin]);
  });

  it('returns Sentry Vite plugins but not enable source maps plugin when sourcemaps.disable is "disable-upload"', () => {
    const plugins = sentryTanstackStart({
      sourcemaps: { disable: 'disable-upload' },
    });

    expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin]);
  });

  it('returns Sentry Vite plugins and enable source maps plugin when sourcemaps.disable is false', () => {
    const plugins = sentryTanstackStart({
      sourcemaps: { disable: false },
    });

    expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockEnableSourceMapsPlugin]);
  });

  it('returns Sentry Vite Plugins and enable source maps plugin by default when sourcemaps is not specified', () => {
    const plugins = sentryTanstackStart({});

    expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockEnableSourceMapsPlugin]);
  });
});
