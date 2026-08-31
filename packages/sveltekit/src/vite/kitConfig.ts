import type { Adapter } from '@sveltejs/kit';
import type { Plugin } from 'vite';
import { loadSvelteConfig } from './svelteConfig';

/**
 * The subset of SvelteKit's configuration that this SDK reads, in a shape that's normalized
 * across SvelteKit majors:
 *
 * - SvelteKit 2 keeps its options nested under `kit` in `svelte.config.js`
 * - SvelteKit 3 removed `svelte.config.js` and passes a flat config to the `sveltekit()` Vite plugin
 *
 * We always work with the flat shape (see {@link normalizeKitConfig}).
 */
export type ResolvedKitConfig = {
  adapter?: Adapter;
  outDir?: string;
  files?: {
    hooks?: {
      client?: string;
      server?: string;
    };
  };
  paths?: {
    // Matches SvelteKit's own type for this option, so it can be handed to an adapter `Builder` as-is
    base?: '' | `/${string}`;
  };
  /** SvelteKit 3 (>= 3.0.0-next.8) promoted native tracing out of `experimental` */
  tracing?: {
    server?: boolean;
  };
  /** SvelteKit 2.31+ and early SvelteKit 3 prereleases nest native tracing here */
  experimental?: {
    tracing?: {
      server?: boolean;
    };
  };
};

/**
 * The SvelteKit Vite plugin exposes the resolved SvelteKit config on its plugin `api`.
 * This is the case in SvelteKit 2 and 3 alike.
 */
const SVELTEKIT_SETUP_PLUGIN_NAME = 'vite-plugin-sveltekit-setup';

type KitPluginApi = {
  options?: ResolvedKitConfig & { kit?: ResolvedKitConfig };
};

export type KitConfigResolver = {
  /**
   * Add this to the Vite plugins before the plugins that call {@link KitConfigResolver.get}.
   *
   * Never `await` {@link KitConfigResolver.get} from a `config` hook: `sveltekit()` is an async
   * factory in both SvelteKit majors, so the plugins array Vite passes to `config` still holds an
   * unresolved promise in its place and the SvelteKit config can only be found in `configResolved`.
   * Awaiting it earlier blocks the `config` phase that would resolve it, and the build hangs.
   */
  plugin: Plugin;
  get: () => Promise<ResolvedKitConfig>;
};

/**
 * Creates a Vite plugin that resolves the SvelteKit config once, plus a getter for other plugins
 * to await it.
 *
 * We read the config from the `sveltekit()` Vite plugin's `api.options` instead of importing
 * `svelte.config.js`: SvelteKit 3 removed that file entirely, and SvelteKit 2.66+ lets users move
 * their config into `vite.config.js` as well.
 *
 * Loading `svelte.config.js` stays as the fallback, and isn't just an edge case: SvelteKit only
 * exposes `api.options` from 2.62 on, so every older 2.x app still resolves through the file, as
 * do setups where the SvelteKit plugin isn't registered at all (or is added by a plugin factory we
 * can't see in time).
 *
 * Not `@sveltejs/load-config`: it re-resolves the `vite.config.js` we're being constructed by, so
 * it ends up waiting on itself and hangs - and it reads this same `api.options` to begin with.
 */
export function createKitConfigResolver(): KitConfigResolver {
  let resolveConfig: (config: ResolvedKitConfig) => void;
  const configPromise = new Promise<ResolvedKitConfig>(resolve => {
    resolveConfig = resolve;
  });

  let isResolved = false;
  const settle = (config: ResolvedKitConfig): void => {
    if (!isResolved) {
      isResolved = true;
      resolveConfig(config);
    }
  };

  const plugin: Plugin = {
    name: 'sentry-sveltekit-kit-config-resolver',
    // Run before our other plugins so that they can await `get()` from within their own hooks.
    enforce: 'pre',

    config: config => {
      const kitConfig = findKitConfigInPlugins(config.plugins);
      if (kitConfig) {
        settle(kitConfig);
      }
      return null;
    },

    configResolved: async config => {
      if (isResolved) {
        return;
      }

      // Plugins added by a promise-returning factory aren't visible in the `config` hook yet,
      // so we take a second look at the fully resolved plugin list.
      const kitConfig = findKitConfigInPlugins(config.plugins);

      settle(kitConfig ?? normalizeKitConfig(await loadSvelteConfig()));
    },
  };

  return { plugin, get: () => configPromise };
}

/**
 * Picks the SvelteKit options off the SvelteKit Vite plugin, if it's registered.
 * Exported only for testing.
 */
export function findKitConfigInPlugins(plugins: unknown): ResolvedKitConfig | undefined {
  if (!Array.isArray(plugins)) {
    return undefined;
  }

  // Plugins can be nested arrays; entries can also be (unresolved) promises, which we skip.
  for (const plugin of plugins.flat(Infinity)) {
    if (!plugin || typeof plugin !== 'object' || (plugin as Plugin).name !== SVELTEKIT_SETUP_PLUGIN_NAME) {
      continue;
    }

    const options = ((plugin as Plugin).api as KitPluginApi | undefined)?.options;
    if (options) {
      return normalizeKitConfig(options);
    }
  }

  return undefined;
}

/**
 * Flattens a SvelteKit 2 config (`{ kit: { ... } }`) to the SvelteKit 3 shape (`{ ... }`).
 * Exported only for testing.
 */
export function normalizeKitConfig(config: ResolvedKitConfig & { kit?: ResolvedKitConfig }): ResolvedKitConfig {
  return config?.kit ?? config ?? {};
}

/**
 * Whether SvelteKit's native server-side tracing is enabled. If it is, we must not add our own
 * server-side instrumentation on top of SvelteKit's, or we'd emit duplicate spans.
 */
export function isNativeServerTracingEnabled(kitConfig: ResolvedKitConfig): boolean {
  return !!(kitConfig.tracing?.server || kitConfig.experimental?.tracing?.server);
}
