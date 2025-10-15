import { consoleSandbox } from '@sentry/core';
import type { NitroConfig } from 'nitropack/types';
import { addPlugin, addVirtualFile, createResolver } from '../utils';

/**
 * Sets up the database instrumentation.
 */
export function addDatabaseInstrumentation(nitro: NitroConfig): void {
  if (!nitro.experimental?.database) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log('[Sentry] No database configuration found. Skipping database instrumentation.');
    });

    return;
  }

  /**
   * This is a different option than the one in `experimental.database`, this configures multiple database instances.
   * keys represent database names to be passed to `useDatabase(name?)`.
   * https://nitro.build/guide/database#configuration
   */
  const databaseInstances = Object.keys(nitro.database || { default: {} });

  // Create a virtual module to pass this data to runtime
  addVirtualFile(nitro, {
    filename: '#sentry/database-config.mjs',
    getContents: () => {
      return `export const databaseInstances = ${JSON.stringify(databaseInstances)};`;
    },
  });

  addPlugin(nitro, createResolver(import.meta.url).resolve('./runtime/plugins/database'));
}
