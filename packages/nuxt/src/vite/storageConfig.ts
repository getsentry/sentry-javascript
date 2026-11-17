import { addNitroPlugin, createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import type { Nitro } from 'nitropack/types';
import type { InputPluginOption } from 'rollup';
import { addServerTemplate } from '../vendor/server-template';

const NITRO_CACHE_VIRTUAL_MODULE_ID = '#nitro/virtual/cache';
const CREATE_CACHE_STORAGE_EXPORT = 'export const createCacheStorage =';

/**
 * Prepares the storage config export to be used in the runtime storage instrumentation.
 */
export function addStorageInstrumentation(nuxt: Nuxt, isLegacyNitro: boolean): void {
  const moduleDirResolver = createResolver(import.meta.url);
  const userStorageMounts = Object.keys(nuxt.options.nitro.storage || {});

  // Create a virtual module to pass this data to runtime
  addServerTemplate({
    filename: '#sentry/storage-config.mjs',
    getContents: () => {
      return `export const userStorageMounts = ${JSON.stringify(userStorageMounts)};`;
    },
  });

  if (isLegacyNitro) {
    addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/storage-legacy.server'));
  } else {
    addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/storage.server'));
  }
}

/**
 * Instruments the storage behind Nitro v3's cached functions and handlers.
 *
 * Nitro v3 creates that storage in the `#nitro/virtual/cache` module, which is generated at build time and
 * can't be reached at runtime, so the module's `createCacheStorage` export is wrapped while bundling.
 */
export function addCacheStorageInstrumentation(nitro: Nitro): void {
  nitro.hooks.hook('rollup:before', (nitro, rollupConfig) => {
    if (!rollupConfig.plugins) {
      rollupConfig.plugins = [];
    }

    if (!Array.isArray(rollupConfig.plugins)) {
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    rollupConfig.plugins.push(cacheStorageInstrumentationPlugin(nitro));
  });
}

function cacheStorageInstrumentationPlugin(nitro: Nitro): InputPluginOption {
  const instrumentStoragePath = createResolver(import.meta.url).resolve('./runtime/utils/instrumentStorage');

  return {
    name: 'sentry-nuxt-cache-storage-instrumentation',
    transform(code: string, id: string) {
      // The `kv` driver re-exports a KV-backed storage, which the storage plugin already instruments
      if (id !== NITRO_CACHE_VIRTUAL_MODULE_ID || !code.includes(CREATE_CACHE_STORAGE_EXPORT)) {
        return null;
      }

      const driverName = (nitro.options as { cache?: { driver?: string } }).cache?.driver ?? 'memory';

      return {
        code: `import { instrumentCacheStorage } from ${JSON.stringify(instrumentStoragePath)};
${code.replace(CREATE_CACHE_STORAGE_EXPORT, 'const createUninstrumentedCacheStorage =')}
export const createCacheStorage = () => instrumentCacheStorage(createUninstrumentedCacheStorage(), ${JSON.stringify(driverName)});
`,
        map: null,
      };
    },
  };
}
