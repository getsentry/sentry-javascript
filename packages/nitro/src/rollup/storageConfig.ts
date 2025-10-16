import type { NitroConfig } from 'nitropack/types';
import { addPlugin, addVirtualFile, createResolver } from '../utils';

/**
 * Prepares the storage config export to be used in the runtime storage instrumentation.
 */
export function addStorageInstrumentation(nitro: NitroConfig): void {
  const userStorageMounts = Object.keys(nitro.storage || {});

  // Create a virtual module to pass this data to runtime
  addVirtualFile(nitro, {
    filename: '#sentry/storage-config.mjs',
    getContents: () => {
      return `export const userStorageMounts = ${JSON.stringify(userStorageMounts)};`;
    },
  });

  addPlugin(nitro, createResolver(import.meta.url).resolve('../runtime/plugins/storage'));
}
