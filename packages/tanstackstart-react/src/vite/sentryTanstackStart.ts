import type { BuildTimeOptionsBase } from '@sentry/core';
import type { Plugin } from 'vite';
import { makeAutoInstrumentMiddlewarePlugin } from './autoInstrumentMiddleware';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';

/**
 * Build-time options for the Sentry TanStack Start SDK.
 */
export interface SentryTanstackStartOptions extends BuildTimeOptionsBase {
  /**
   * Configure automatic middleware instrumentation.
   *
   * - Set to `false` to disable automatic middleware instrumentation entirely.
   * - Set to `true` (default) to enable for all middleware files.
   * - Set to an object with `exclude` to enable but exclude specific files.
   *
   * The `exclude` option takes an array of strings or regular expressions matched
   * against the full file path. String patterns match as substrings.
   *
   * @default true
   *
   * @example
   * // Disable completely
   * sentryTanstackStart({ autoInstrumentMiddleware: false })
   *
   * @example
   * // Enable with exclusions
   * sentryTanstackStart({
   *   autoInstrumentMiddleware: {
   *     exclude: ['/routes/admin/', /\.test\.ts$/],
   *   },
   * })
   */
  autoInstrumentMiddleware?:
    | boolean
    | {
        exclude?: Array<string | RegExp>;
      };
}

/**
 * Vite plugins for the Sentry TanStack Start SDK.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { sentryTanstackStart } from '@sentry/tanstackstart-react';
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
  // only add plugins in production builds
  if (process.env.NODE_ENV === 'development') {
    return [];
  }

  const plugins: Plugin[] = [...makeAddSentryVitePlugin(options)];

  // middleware auto-instrumentation
  const autoInstrumentConfig = options.autoInstrumentMiddleware;
  const isDisabled = autoInstrumentConfig === false;
  const excludePatterns = typeof autoInstrumentConfig === 'object' ? autoInstrumentConfig.exclude : undefined;

  if (!isDisabled) {
    plugins.push(
      makeAutoInstrumentMiddlewarePlugin({
        enabled: true,
        debug: options.debug,
        exclude: excludePatterns,
      }),
    );
  }

  // source maps
  const sourceMapsDisabled = options.sourcemaps?.disable === true || options.sourcemaps?.disable === 'disable-upload';
  if (!sourceMapsDisabled) {
    plugins.push(...makeEnableSourceMapsVitePlugin(options));
  }

  return plugins;
}
