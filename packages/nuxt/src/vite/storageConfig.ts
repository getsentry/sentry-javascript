import { addServerPlugin, createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { addServerTemplate } from '../vendor/server-template';

/**
 * Prepares the storage config export to be used in the runtime storage instrumentation.
 */
export function addStorageInstrumentation(nuxt: Nuxt, isLegacyNitro: boolean): void {
  // On Nitro 3+, storage/cache instrumentation comes from `@sentry/server-utils`' `nitroIntegration`,
  // which is auto-injected via `@sentry/node`'s default integrations and subscribes to unstorage's
  // native tracing channels. Registering a Nuxt storage plugin as well would instrument every cache
  // operation twice, so Nuxt only instruments storage itself on legacy Nitro (v2), which has no such
  // channels.
  if (!isLegacyNitro) {
    return;
  }

  const moduleDirResolver = createResolver(import.meta.url);
  const userStorageMounts = Object.keys(nuxt.options.nitro.storage || {});

  // Create a virtual module to pass this data to runtime
  addServerTemplate({
    filename: '#sentry/storage-config.mjs',
    getContents: () => {
      return `export const userStorageMounts = ${JSON.stringify(userStorageMounts)};`;
    },
  });

  addServerPlugin(moduleDirResolver.resolve('./runtime/plugins/storage-legacy.server'));
}
