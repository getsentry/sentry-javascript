import { addServerPlugin, createResolver } from '@nuxt/kit';
import { consoleSandbox } from '@sentry/core';
import type { NitroConfig } from 'nitropack/types';
import { addServerTemplate } from '../vendor/server-template';

/**
 * Sets up the database instrumentation.
 */
export function addDatabaseInstrumentation(nitro: NitroConfig): void {
  if (!nitro.experimental?.database) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] [Nitro Database Plugin]: No database configuration found. Skipping database instrumentation.',
      );
    });

    return;
  }

  /**
   * This is a different option than the one in `experimental.database`, this configures multiple database instances.
   * keys represent database names to be passed to `useDatabase(name?)`.
   * We also use the config to populate database span attributes.
   * https://nitro.build/guide/database#configuration
   */
  const databaseConfig = nitro.database || { default: {} };

  // Create a virtual module to pass this data to runtime
  addServerTemplate({
    filename: '#sentry/database-config.mjs',
    getContents: () => {
      return `export const databaseConfig = ${JSON.stringify(databaseConfig)};`;
    },
  });

  addServerPlugin(createResolver(import.meta.url).resolve('./runtime/plugins/database.server'));
}
