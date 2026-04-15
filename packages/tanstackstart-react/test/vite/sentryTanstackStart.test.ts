import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAutoInstrumentMiddlewarePlugin } from '../../src/vite/autoInstrumentMiddleware';
import { sentryTanstackStart } from '../../src/vite/sentryTanstackStart';
import { makeTunnelRoutePlugin } from '../../src/vite/tunnelRoute';

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

const mockMiddlewarePlugin: Plugin = {
  name: 'sentry-tanstack-middleware-auto-instrument',
  apply: 'build',
  transform: vi.fn(),
};

const mockTunnelRoutePlugin: Plugin = {
  name: 'sentry-tanstackstart-tunnel-route',
  enforce: 'pre',
  transform: vi.fn(),
};

vi.mock('../../src/vite/sourceMaps', () => ({
  makeAddSentryVitePlugin: vi.fn(() => [mockSourceMapsConfigPlugin, mockSentryVitePlugin]),
  makeEnableSourceMapsVitePlugin: vi.fn(() => [mockEnableSourceMapsPlugin]),
}));

vi.mock('../../src/vite/autoInstrumentMiddleware', () => ({
  makeAutoInstrumentMiddlewarePlugin: vi.fn(() => mockMiddlewarePlugin),
}));

vi.mock('../../src/vite/tunnelRoute', () => ({
  makeTunnelRoutePlugin: vi.fn(() => mockTunnelRoutePlugin),
}));

describe('sentryTanstackStart()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'production';
  });

  describe('source maps', () => {
    it('returns source maps plugins in production mode', () => {
      const plugins = sentryTanstackStart({ autoInstrumentMiddleware: false });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockEnableSourceMapsPlugin]);
    });

    it('returns no plugins in development mode when tunnelRoute is not configured', () => {
      process.env.NODE_ENV = 'development';

      const plugins = sentryTanstackStart({ autoInstrumentMiddleware: false });

      expect(plugins).toEqual([]);
    });

    it('returns only the tunnel route plugin in development mode when tunnelRoute is configured', () => {
      process.env.NODE_ENV = 'development';

      const plugins = sentryTanstackStart({
        autoInstrumentMiddleware: false,
        tunnelRoute: { allowedDsns: ['https://public@o0.ingest.sentry.io/0'] },
      });

      expect(plugins).toEqual([mockTunnelRoutePlugin]);
    });

    it('returns Sentry Vite plugins but not enable source maps plugin when sourcemaps.disable is true', () => {
      const plugins = sentryTanstackStart({
        autoInstrumentMiddleware: false,
        sourcemaps: { disable: true },
      });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin]);
    });

    it('returns Sentry Vite plugins but not enable source maps plugin when sourcemaps.disable is "disable-upload"', () => {
      const plugins = sentryTanstackStart({
        autoInstrumentMiddleware: false,
        sourcemaps: { disable: 'disable-upload' },
      });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin]);
    });

    it('returns Sentry Vite plugins and enable source maps plugin when sourcemaps.disable is false', () => {
      const plugins = sentryTanstackStart({
        autoInstrumentMiddleware: false,
        sourcemaps: { disable: false },
      });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockEnableSourceMapsPlugin]);
    });
  });

  describe('middleware auto-instrumentation', () => {
    it('includes middleware plugin by default', () => {
      const plugins = sentryTanstackStart({ sourcemaps: { disable: true } });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockMiddlewarePlugin]);
    });

    it('includes middleware plugin when autoInstrumentMiddleware is true', () => {
      const plugins = sentryTanstackStart({
        autoInstrumentMiddleware: true,
        sourcemaps: { disable: true },
      });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockMiddlewarePlugin]);
    });

    it('does not include middleware plugin when autoInstrumentMiddleware is false', () => {
      const plugins = sentryTanstackStart({
        autoInstrumentMiddleware: false,
        sourcemaps: { disable: true },
      });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin]);
    });

    it('passes correct options to makeAutoInstrumentMiddlewarePlugin', () => {
      sentryTanstackStart({ debug: true, sourcemaps: { disable: true } });

      expect(makeAutoInstrumentMiddlewarePlugin).toHaveBeenCalledWith({ enabled: true, debug: true });
    });

    it('passes debug: undefined when not specified', () => {
      sentryTanstackStart({ sourcemaps: { disable: true } });

      expect(makeAutoInstrumentMiddlewarePlugin).toHaveBeenCalledWith({ enabled: true, debug: undefined });
    });
  });

  describe('managed tunnel route', () => {
    it('includes the managed tunnel route plugin in production when configured', () => {
      const plugins = sentryTanstackStart({
        tunnelRoute: {
          allowedDsns: ['https://public@o0.ingest.sentry.io/0'],
          tunnel: '/monitor',
        },
        sourcemaps: { disable: true },
      });

      expect(plugins).toEqual([mockSourceMapsConfigPlugin, mockSentryVitePlugin, mockTunnelRoutePlugin, mockMiddlewarePlugin]);
    });

    it('passes tunnelRoute options through to the tunnel route plugin', () => {
      const tunnelRoute = {
        allowedDsns: ['https://public@o0.ingest.sentry.io/0'],
        tunnel: '/monitor' as const,
      };

      sentryTanstackStart({ tunnelRoute, sourcemaps: { disable: true } });

      expect(makeTunnelRoutePlugin).toHaveBeenCalledWith(tunnelRoute, undefined);
    });
  });
});
