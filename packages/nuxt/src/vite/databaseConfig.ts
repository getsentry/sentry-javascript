import { addServerPlugin, createResolver } from '@nuxt/kit';
import { consoleSandbox } from '@sentry/core';
import type { Nuxt } from 'nuxt/schema';
import { addServerTemplate } from '../vendor/server-template';

/**
 * Sets up the database instrumentation.
 */
export function addDatabaseInstrumentation(nuxt: Nuxt): void {
  if (!nuxt.options.nitro?.experimental?.database) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log('[Sentry] No database configuration found. Skipping database instrumentation.');
    });

    return;
  }

  /**
   * This is a different flag than the one in experimental.database, this configures multiple database instances.
   * keys represent database names to be passed to `useDatabase(name?)`.
   * https://nitro.build/guide/database#configuration
   */
  const databaseInstances = Object.keys(nuxt.options.nitro.database || { default: {} });

  // Create a virtual module to pass this data to runtime
  addServerTemplate({
    filename: '#sentry/database-config.mjs',
    getContents: () => {
      return `export const databaseInstances = ${JSON.stringify(databaseInstances)};`;
    },
  });

  addServerPlugin(createResolver(import.meta.url).resolve('./runtime/plugins/database.server'));
}
