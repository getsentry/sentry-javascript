import type { UserConfig } from 'vite';
import type { SentryTanstackStartReactPluginOptions } from './types';

/**
 * Wraps a Vite configuration object with Sentry build-time enhancements such as
 * automatic source maps upload.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { wrapConfigWithSentry } from '@sentry/tanstackstart-react';
 *
 * export default defineConfig(
 *   wrapConfigWithSentry(
 *     {
 *       // Your Vite/TanStack Start config
 *       plugins: [...]
 *     },
 *     {
 *       // Sentry build-time options
 *       org: 'your-org',
 *       project: 'your-project',
 *     },
 *   ),
 * );
 * ```
 *
 * @param config - A Vite configuration object
 * @param sentryPluginOptions - Options to configure the Sentry Vite plugin
 * @returns The modified Vite config to be passed to `defineConfig`
 */
export function wrapConfigWithSentry(
  config: UserConfig = {},
  _sentryPluginOptions: SentryTanstackStartReactPluginOptions = {},
): UserConfig {
  // TODO: Add Sentry Vite plugins for source map upload
  console.log('wrapConfigWithSentry', config, _sentryPluginOptions);
  return config;
}
