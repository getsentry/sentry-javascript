import { consoleSandbox } from '@sentry/core';
import type { DatabaseConnectionConfig as DatabaseConfig, Nitro } from 'nitropack/types';
import type { InputPluginOption } from 'rollup';
import { addPlugin, createResolver } from '../utils';

/**
 * Sets up the database instrumentation.
 */
export function setupDatabaseInstrumentation(nitro: Nitro): void {
  if (!nitro.options.experimental?.database) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log('[Sentry] No database configuration found. Skipping database instrumentation.');
    });

    return;
  }

  /**
   * This is a different option than the one in `experimental.database`, this configures multiple database instances.
   * keys represent database names to be passed to `useDatabase(name?)`.
   * We also use the config to populate database span attributes.
   * https://nitro.build/guide/database#configuration
   */
  const databaseConfig = nitro.options.database || { default: {} };
  const pluginPath = createResolver(import.meta.url).resolve('../runtime/plugins/database.js');

  addPlugin(nitro, pluginPath);

  // Add a Rollup plugin to inject the database config directly into the runtime plugin
  nitro.hooks.hook('rollup:before', (_nitro, rollupConfig) => {
    if (rollupConfig?.plugins === null || rollupConfig?.plugins === undefined) {
      rollupConfig.plugins = [];
    } else if (!Array.isArray(rollupConfig.plugins)) {
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    rollupConfig.plugins.push(createDatabaseConfigInjectionPlugin(databaseConfig, pluginPath));
  });
}

/**
 * Creates a Rollup plugin that injects the database config into the runtime plugin
 */
function createDatabaseConfigInjectionPlugin(
  databaseConfig: Record<string, DatabaseConfig>,
  pluginPath: string,
): InputPluginOption {
  return {
    name: 'sentry-inject-database-config',
    transform: {
      filter: {
        id: pluginPath,
      },
      handler(code: string) {
        let transformedCode = code;

        // Add the import statement at the top
        transformedCode = `import { useDatabase } from '#imports';\n${transformedCode}`;

        // Replace the config placeholder with the actual config
        transformedCode = transformedCode.replace(
          'const _databaseConfig = {}',
          `const _databaseConfig = ${JSON.stringify(databaseConfig)};\n
        const __SENTRY_INJECTED__ = true;`,
        );

        return {
          code: transformedCode,
          map: null,
        };
      },
    },
  };
}
