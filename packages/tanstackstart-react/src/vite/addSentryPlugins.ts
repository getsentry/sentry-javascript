import type { PluginOption } from 'vite';
import type { SentryTanstackStartReactPluginOptions } from '../config/types';

/**
 * Adds Sentry plugins to the given array of Vite plugins.
 */
export function addSentryPlugins(
  plugins: PluginOption[],
  _options: SentryTanstackStartReactPluginOptions,
): PluginOption[] {
  // TODO: Add Sentry Vite plugins for source map upload
  return plugins;
}
