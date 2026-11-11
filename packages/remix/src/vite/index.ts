import type { Plugin } from 'vite';
import { makeOrchestrionPlugin } from './orchestrionPlugin';
import { makeRouteManifestPlugin } from './routeManifestPlugin';
import type { SourceMapState } from './sourceMaps';
import { makeAddSentryVitePlugin, makeEnableSourceMapsPlugin } from './sourceMaps';
import type { SentryRemixVitePluginOptions } from './types';

export type { SentryRemixVitePluginOptions };

/**
 * Sentry Vite plugins for Remix.
 *
 * Add these to your Vite configuration to
 * - inject the Remix route manifest, so client-side transactions are parameterized,
 * - build-time instrument supported server-side dependencies (such as database clients), and
 * - inject debug IDs and upload source maps to Sentry.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { vitePlugin as remix } from '@remix-run/dev';
 * import { sentryRemixVitePlugin } from '@sentry/remix/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     remix(),
 *     sentryRemixVitePlugin({
 *       appDirPath: './app',
 *       org: 'your-org',
 *       project: 'your-project',
 *       authToken: process.env.SENTRY_AUTH_TOKEN,
 *     }),
 *   ],
 * });
 * ```
 */
export function sentryRemixVitePlugin(options: SentryRemixVitePluginOptions = {}): Plugin[] {
  const plugins: Plugin[] = [makeRouteManifestPlugin(options), makeOrchestrionPlugin(options)];

  // Uploading from the dev server would create a new set of artifacts on every restart.
  if (process.env.NODE_ENV === 'development') {
    return plugins;
  }

  const sourceMapState: SourceMapState = { sdkEnabledSourceMaps: false };

  // `'disable-upload'` still generates them - debug IDs are injected and the user uploads by hand.
  //
  // Order matters: the bundler plugin decides on the `build.sourcemap` it finds in its own
  // `config` hook, so this plugin has to set it first.
  if (options.sourcemaps?.disable !== true) {
    plugins.push(makeEnableSourceMapsPlugin(options, sourceMapState));
  }

  // Added even when source maps are disabled: the bundler plugin also applies bundle size
  // optimizations, module metadata, the application key and release management, and it already
  // skips the upload itself.
  plugins.push(...makeAddSentryVitePlugin(options, sourceMapState));

  return plugins;
}
