import type { BuildTimeOptionsBase } from '@sentry/core';
import type { Plugin } from 'vite';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';

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
 *     sentryTanstackStart({
 *       org: 'your-org',
 *       project: 'your-project',
 *     }),
 *     tanstackStart(),
 *   ],
 * });
 * ```
 *
 * @param options - Options to configure the Sentry Vite plugins
 * @returns An array of Vite plugins
 */
export function sentryTanstackStart(options: BuildTimeOptionsBase = {}): Plugin[] {
  const plugins: Plugin[] = [];

  // Only add source map plugins in production builds
  if (process.env.NODE_ENV !== 'development') {
    const sourceMapsDisabled = options.sourcemaps?.disable === true || options.sourcemaps?.disable === 'disable-upload';

    if (!sourceMapsDisabled) {
      // Add source maps upload plugin
      plugins.push(...makeAddSentryVitePlugin(options));

      // Add plugin to enable source maps if not already configured
      plugins.push(...makeEnableSourceMapsVitePlugin(options));
    }
  }

  return plugins;
}
