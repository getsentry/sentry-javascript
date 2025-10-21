import type { Nitro } from 'nitropack/types';

/**
 * Adds a Nitro plugin
 */
export function addPlugin(nitro: Nitro, plugin: string): void {
  // in dev mode, crash occurs when trying to import #nitrpack or anything
  // https://github.com/nuxt/icon/issues/204
  // so just skip it in dev for now
  // if (nitro.options.dev) {
  //   return;
  // }

  nitro.options.plugins = nitro.options.plugins || [];
  nitro.options.plugins.push(plugin);
}
