import { addServerPlugin, createResolver } from '@nuxt/kit';
import type { Nuxt } from 'nuxt/schema';
import { addServerTemplate } from '../vendor/server-template';

/**
 * Prepares the storage config export to be used in the runtime storage instrumentation.
 */
export function addStorageInstrumentation(nuxt: Nuxt): void {
  const moduleDirResolver = createResolver(import.meta.url);
  const userStorageMounts = Object.keys(nuxt.options.nitro.storage || {});

  // Create a virtual module to pass this data to runtime
  addServerTemplate({
    filename: '#sentry/storage-config.mjs',
    getContents: () => {
      return `export const userStorageMounts = ${JSON.stringify(userStorageMounts)};`;
    },
  });

  addServerPlugin(moduleDirResolver.resolve('./runtime/plugins/storage.server'));
}
