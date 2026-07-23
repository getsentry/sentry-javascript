import type { Plugin, UserConfig } from 'vite';

// `@vercel/nft` only traces the `module-sync` target of a package's `exports` map when the Node
// process *running the build* is >= 22, but Node's CJS loader matches `module-sync` at runtime from
// 20.19. A Nitro server built on Node 20 is therefore missing files its own runtime resolves (e.g.
// `meriyah/dist/meriyah.mjs`, reached through `@apm-js-collab/code-transformer`) and crashes with
// `MODULE_NOT_FOUND`. nft's `moduleSyncCatchall` option (>= 1.10.0, ignored by older versions)
// makes it emit both targets regardless of the build Node version.
//
// The Nitro v3 Vite plugin merges the `nitro` key of the resolved Vite config into its options with
// the lowest precedence (options passed to `nitro()` win), and forwards `externals.trace.nft` into
// `nodeFileTrace()`.
//
// Remove once https://github.com/vercel/nft/issues/603 is fixed and picked up by Nitro.

/**
 * Configures Nitro's externals tracing to emit all `module-sync` exports targets, independent of
 * the Node.js version running the build. See the comment above for background.
 */
export function makeModuleSyncTracingPlugin(): Plugin {
  return {
    name: 'sentry-tanstackstart-react-module-sync-tracing',
    config: {
      // The Nitro plugin reads the config's `nitro` key inside its own plain-ordered `config` hook,
      // and users place `nitro()` before the Sentry plugins — `pre` makes this run first anyway.
      order: 'pre',
      handler: () =>
        ({
          nitro: {
            externals: {
              trace: {
                nft: {
                  moduleSyncCatchall: true,
                },
              },
            },
          },
        }) as UserConfig,
    },
  };
}
