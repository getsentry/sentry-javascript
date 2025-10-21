import type { Nitro } from 'nitropack/types';
import type { InputPluginOption } from 'rollup';
import { addPlugin, createResolver } from '../utils';

/**
 * Prepares the storage config export to be used in the runtime storage instrumentation.
 */
export function setupStorageInstrumentation(nitro: Nitro): void {
  const userStorageMounts = Object.keys(nitro.options.storage || {});
  const pluginPath = createResolver(import.meta.url).resolve('../runtime/plugins/storage.js');

  // Add a Rollup plugin to inject the storage config directly into the runtime plugin
  nitro.hooks.hook('rollup:before', (_nitro, rollupConfig) => {
    if (rollupConfig?.plugins === null || rollupConfig?.plugins === undefined) {
      rollupConfig.plugins = [];
    } else if (!Array.isArray(rollupConfig.plugins)) {
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    rollupConfig.plugins.unshift(createStorageConfigInjectionPlugin(userStorageMounts, pluginPath));
  });

  // Add the plugin to Nitro's plugin list (respects dev mode check)
  addPlugin(nitro, pluginPath);
}

/**
 * Creates a Rollup plugin that injects the storage config into the runtime plugin
 */
function createStorageConfigInjectionPlugin(userStorageMounts: string[], pluginPath: string): InputPluginOption {
  return {
    name: 'sentry-inject-storage-config',
    transform: {
      filter: {
        id: pluginPath,
      },
      handler(code: string) {
        let transformedCode = code;

        // Add the import statement at the top
        transformedCode = `import { useStorage } from '#imports';\n${transformedCode}`;

        // Replace the config placeholder with the actual config
        transformedCode = transformedCode.replace(
          'const userMounts = new Set();',
          `const userMounts = new Set(${JSON.stringify(userStorageMounts.map(m => `${m}:`))});\n
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
