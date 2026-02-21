import type { Plugin, UserConfig } from 'vite';

/**
 * Creates a Vite plugin that configures Nitro to treat `@sentry/*` packages as external dependencies.
 *
 * We need this to prevent build issues we were seeing with recent versions of Nitro.
 */
export function makeNitroSentryExternalPlugin(): Plugin {
  return {
    name: 'sentry-tanstack-start-nitro-external',
    enforce: 'pre',
    config() {
      // The `nitro` property is not part of Vite's UserConfig type but is read by the Nitro Vite plugin
      return {
        nitro: {
          rollupConfig: {
            external: [/^@sentry\//],
          },
        },
      } as UserConfig;
    },
  };
}
