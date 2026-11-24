import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
import type { NitroModule } from 'nitro/types';

// The names `sentryOrchestrionPlugin` returns, with and without `buildTimeInstrumentation`.
const ORCHESTRION_PLUGIN_NAMES = ['code-transformer', 'sentry-orchestrion-disabled'];

function hasOrchestrionPlugin(plugins: unknown): boolean {
  if (Array.isArray(plugins)) {
    return plugins.some(hasOrchestrionPlugin);
  }
  const name = (plugins as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' && ORCHESTRION_PLUGIN_NAMES.includes(name);
}

/**
 * Creates a Nitro module that adds the orchestrion code transform to the server build, so instrumented
 * dependencies publish `diagnostics_channel` events from the bundle.
 */
export function createOrchestrionModule(): NitroModule {
  return {
    name: 'sentry-orchestrion',
    setup: nitro => {
      // Under Vite, the server build also runs the Vite plugins, where a Sentry Vite plugin may already add the
      // transform without showing up in the config below. A module transformed twice fails the build.
      if (nitro.options.builder === 'vite') {
        return;
      }

      // Apps that add the plugin themselves keep theirs. Registering at `build:before` runs this after the
      // `rollup:before` hooks of every module, in whichever order the modules are listed.
      nitro.hooks.hookOnce('build:before', () => {
        nitro.hooks.hook('rollup:before', (_nitro, config) => {
          if (hasOrchestrionPlugin(config.plugins)) {
            return;
          }
          config.plugins = [config.plugins, sentryOrchestrionPlugin()];
        });
      });
    },
  };
}
