import type { NitroConfig } from 'nitropack/types';

/**
 * Adds a Nitro plugin
 */
export function addPlugin(nitro: NitroConfig, plugin: string): void {
  nitro.plugins = nitro.plugins || [];
  nitro.plugins.push(plugin);
}
