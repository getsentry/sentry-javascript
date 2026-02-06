import type { BuildTimeOptionsBase } from '@sentry/core';
import type { Plugin } from 'vite';
import { makeAutoInstrumentMiddlewarePlugin } from './autoInstrumentMiddleware';
import { makeCopyInstrumentationFilePlugin } from './copyInstrumentationFile';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';

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
   * Path to the instrumentation file to be copied to the server build output directory.
   *
   * Relative paths are resolved from the current working directory.
   *
   * @default 'instrument.server.mjs'
   */
  instrumentationFilePath?: string;

  /**
   * Custom server output directory path for the instrumentation file.
   *
   * By default, the plugin auto-detects the output directory:
   * - For Nitro: reads from Vite environment config
   * - For Cloudflare/Netlify: uses `dist/server`
   *
   * Use this option to override the default when your deployment target
   * uses a non-standard output directory.
   *
   * @example 'build/server'
   */
  serverOutputDir?: string;
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

  // copy instrumentation file to build output
  plugins.push(
    makeCopyInstrumentationFilePlugin({
      instrumentationFilePath: options.instrumentationFilePath,
      serverOutputDir: options.serverOutputDir,
    }),
  );

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
