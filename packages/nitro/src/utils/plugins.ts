import type { Nitro } from 'nitropack/types';

/**
 * Adds a Nitro plugin
 */
export function addPlugin(nitro: Nitro, plugin: string): void {
  nitro.options.plugins = nitro.options.plugins || [];
  nitro.options.plugins.push(plugin);
}
