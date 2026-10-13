import { addNitroPlugin, createResolver } from '@nuxt/kit';
import { consoleSandbox } from '@sentry/core';
import type { ConnectorName } from 'db0';
import type { Nitro, NitroConfig } from 'nitropack/types';
import type { SentryNuxtModuleOptions } from '../common/types';
import { addServerTemplate } from '../vendor/server-template';

const DATABASE_CONFIG_TEMPLATE = '#sentry/database-config.mjs';

/**
 * Sets up the database instrumentation.
 */
export function addDatabaseInstrumentation(
  nitro: NitroConfig,
  isLegacyNitro: boolean,
  moduleOptions?: SentryNuxtModuleOptions,
): void {
  if (!nitro.experimental?.database) {
    // We cannot use DEBUG_BUILD here because it is a runtime flag, so it is not available for build time scripts
    // So we have to pass in the module options to the build time script
    moduleOptions?.debug &&
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
    filename: DATABASE_CONFIG_TEMPLATE,
    getContents: () => getDatabaseConfigModule(databaseConfig),
  });

  if (isLegacyNitro) {
    addNitroPlugin(createResolver(import.meta.url).resolve('./runtime/plugins/database-legacy.server'));
  } else {
    addNitroPlugin(createResolver(import.meta.url).resolve('./runtime/plugins/database.server'));
  }
}

/**
 * Leaves the databases with the given db0 connector out of the database instrumentation of this Nitro build.
 */
export function skipDatabaseInstrumentation(nitro: Nitro, connector: ConnectorName): void {
  if (!nitro.options.virtual[DATABASE_CONFIG_TEMPLATE]) {
    return;
  }

  const databaseConfig = Object.fromEntries(
    Object.entries(nitro.options.database ?? {}).filter(([, config]) => config.connector !== connector),
  );
  nitro.options.virtual[DATABASE_CONFIG_TEMPLATE] = () => getDatabaseConfigModule(databaseConfig);
}

function getDatabaseConfigModule(databaseConfig: object): string {
  return `export const databaseConfig = ${JSON.stringify(databaseConfig)};`;
}
