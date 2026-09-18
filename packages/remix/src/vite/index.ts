import type { Plugin } from 'vite';
import { makeOrchestrionPlugin } from './orchestrionPlugin';
import { makeRouteManifestPlugin } from './routeManifestPlugin';
import type { SentryRemixVitePluginOptions } from './types';

export type { SentryRemixVitePluginOptions };

/**
 * Sentry Vite plugins for Remix.
 *
 * Add these to your Vite configuration to
 * - inject the Remix route manifest, so client-side transactions are parameterized, and
 * - build-time instrument supported server-side dependencies (such as database clients).
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
 *     }),
 *   ],
 * });
 * ```
 */
export function sentryRemixVitePlugin(options: SentryRemixVitePluginOptions = {}): Plugin[] {
  return [makeRouteManifestPlugin(options), makeOrchestrionPlugin(options)];
}
