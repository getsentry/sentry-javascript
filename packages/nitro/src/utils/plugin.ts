import type { Nitro } from 'nitro/types';

/**
 * Adds a Nitro plugin
 */
export function addPlugin(nitro: Nitro, plugin: string): void {
  nitro.options.plugins = nitro.options.plugins || [];
  nitro.options.plugins.push(plugin);
}

/**
 * Makes Nitro bundle files under the given path instead of loading them from `node_modules` at runtime.
 */
export function addNoExternal(nitro: Nitro, path: string): void {
  if (nitro.options.noExternals === true) {
    return;
  }

  nitro.options.noExternals = [...(nitro.options.noExternals || []), path];
}
