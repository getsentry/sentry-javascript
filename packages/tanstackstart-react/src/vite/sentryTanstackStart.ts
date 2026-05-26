import type { BuildTimeOptionsBase } from '@sentry/core';
import type { Plugin } from 'vite';
import { makeAutoInstrumentMiddlewarePlugin } from './autoInstrumentMiddleware';
import { makeRoutePatternPlugin } from './routePatterns';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';
import type { TunnelRouteOptions } from './tunnelRoute';
import { makeTunnelRoutePlugin } from './tunnelRoute';

/**
 * Build-time options for the Sentry TanStack Start SDK.
 */
export interface SentryTanstackStartOptions extends BuildTimeOptionsBase {
  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument TanStack Start middlewares.
   *
   * This wraps global middlewares (`requestMiddleware` and `functionMiddleware`) in `createStart()` with Sentry
   * instrumentation to capture performance data.
   *
   * Set to `false` to disable automatic middleware instrumentation if you prefer to wrap middlewares manually
   * using `wrapMiddlewaresWithSentry`.
   *
   * @default true
   */
  autoInstrumentMiddleware?: boolean;

  /**
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
   * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
   */
  reactComponentAnnotation?: {
    /**
     * Whether the component name annotate plugin should be enabled or not.
     */
    enabled?: boolean;

    /**
     * A list of strings representing the names of components to ignore. The plugin will not apply `data-sentry` annotations on the DOM element for these components.
     */
    ignoredComponents?: string[];
  };

  /**
   * Configures a framework-managed same-origin tunnel route for Sentry envelopes.
   *
   * This creates a TanStack Start server route backed by `createSentryTunnelRoute()` and applies the resulting path
   * as the default `tunnel` option on the client.
   *
   * You can pass:
   * - `true` to generate an opaque route path per dev session or production build.
   * - `'/custom-path'` to use a fixed static route path.
   * - `{ allowedDsns, path }` for full control. If `allowedDsns` is omitted or empty, the tunnel route derives the DSN
   *   from the active server Sentry client at runtime.
   *
   * If you also pass `tunnel` to `Sentry.init()`, that explicit runtime option wins and a warning is emitted because
   * the managed tunnel route is being bypassed.
   */
  tunnelRoute?: TunnelRouteOptions;
}

/**
 * Vite plugins for the Sentry TanStack Start SDK.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
 * import { tanstackStart } from '@tanstack/react-start/plugin/vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     tanstackStart(),
 *     sentryTanstackStart({
 *       org: 'your-org',
 *       project: 'your-project',
 *     }),
 *   ],
 * });
 * ```
 *
 * @param options - Options to configure the Sentry Vite plugins
 * @returns An array of Vite plugins
 */
export function sentryTanstackStart(options: SentryTanstackStartOptions = {}): Plugin[] {
  const plugins: Plugin[] = [makeRoutePatternPlugin()];

  if (options.tunnelRoute) {
    plugins.push(makeTunnelRoutePlugin(options.tunnelRoute, options.debug));
  }

  // only add build-time plugins in production builds
  if (process.env.NODE_ENV === 'development') {
    return plugins;
  }

  plugins.push(...makeAddSentryVitePlugin(options));

  // middleware auto-instrumentation
  if (options.autoInstrumentMiddleware !== false) {
    plugins.push(makeAutoInstrumentMiddlewarePlugin({ enabled: true, debug: options.debug }));
  }

  // source maps
  const sourceMapsDisabled = options.sourcemaps?.disable === true || options.sourcemaps?.disable === 'disable-upload';
  if (!sourceMapsDisabled) {
    plugins.push(...makeEnableSourceMapsVitePlugin(options));
  }

  return plugins;
}
