import type { SentryVitePluginOptions } from '@sentry/vite-plugin';

export interface SentryVinextPluginOptions extends Partial<SentryVitePluginOptions> {
  /**
   * If enabled, the plugin will automatically wrap route handlers, server components,
   * and middleware with Sentry instrumentation.
   *
   * @default true
   */
  autoInstrument?: boolean | AutoInstrumentOptions;

  /**
   * If enabled, source maps will be automatically uploaded to Sentry during production builds.
   *
   * @default true
   */
  autoUploadSourceMaps?: boolean;

  /**
   * Options for bundle size optimizations.
   */
  bundleSizeOptimizations?: {
    excludeDebugStatements?: boolean;
    excludeReplayIframe?: boolean;
    excludeReplayShadowDom?: boolean;
    excludeReplayWorker?: boolean;
  };
}

export interface AutoInstrumentOptions {
  /**
   * Whether to auto-wrap App Router server components (page.tsx, layout.tsx).
   * @default true
   */
  serverComponents?: boolean;

  /**
   * Whether to auto-wrap App Router route handlers (route.ts).
   * @default true
   */
  routeHandlers?: boolean;

  /**
   * Whether to auto-wrap middleware (middleware.ts).
   * @default true
   */
  middleware?: boolean;

  /**
   * Whether to auto-wrap Pages Router API routes.
   * @default true
   */
  apiRoutes?: boolean;
}
