import type { Adapter } from '@sveltejs/kit';
import * as path from 'path';
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

/** The plugin that carries the resolved SvelteKit config on its `api`, in SvelteKit 2 and 3 alike. */
const SVELTEKIT_SETUP_PLUGIN_NAME = 'vite-plugin-sveltekit-setup';

type KitPluginApi = {
  options?: ResolvedKitConfig & { kit?: ResolvedKitConfig };
};

export type KitConfigResolver = {
  /**
   * Register this before the plugins that call {@link KitConfigResolver.get}.
   *
   * Never `await` {@link KitConfigResolver.get} from a `config` hook: `sveltekit()` is an async
   * factory in both majors, so the plugin array Vite passes to `config` still holds an unresolved
   * promise where the SvelteKit plugin will be - it's only findable in `configResolved`. Awaiting
   * from `config` blocks the very phase that would resolve it, and the build hangs.
   */
  plugin: Plugin;
  get: () => Promise<ResolvedKitConfig>;
};

/**
 * Creates a Vite plugin that resolves the SvelteKit config once, plus a getter for other plugins
 * to await it.
 *
 * The config comes from the `sveltekit()` Vite plugin's `api.options` rather than from
 * `svelte.config.js`: SvelteKit 3 removed that file, and 2.66+ lets users move their config into
 * `vite.config.js`. Loading `svelte.config.js` stays as the fallback, and isn't just an edge case:
 * `api.options` only exists from 2.62 on, so every older 2.x app still resolves through the file,
 * as do setups where the SvelteKit plugin isn't registered at all.
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
    // Vite runs `configResolved` hooks concurrently, so plugin order doesn't gate `get()`.
    // `pre` only matters for the `config` hook below.
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

      try {
        // Plugins added by a promise-returning factory aren't visible in the `config` hook yet,
        // so we take a second look at the fully resolved plugin list.
        const kitConfig = findKitConfigInPlugins(config.plugins);

        settle(kitConfig ?? normalizeKitConfig(await loadSvelteConfig()));
      } finally {
        // Never leave `get()` pending: awaiting it would hang the build without surfacing a reason.
        settle({});
      }
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
 * Flattens a SvelteKit 2 config (`{ kit: { ... } }`) to the SvelteKit 3 shape (`{ ... }`) and makes
 * the paths we read relative and `/`-separated.
 *
 * SvelteKit resolves `outDir` and `files.hooks.*` against the cwd before exposing them on
 * `api.options`, but everything downstream matches them as relative paths: the hooks file regexp
 * against Vite module ids, the injected output dir against stack frames from another machine.
 *
 * Exported only for testing.
 */
export function normalizeKitConfig(config: ResolvedKitConfig & { kit?: ResolvedKitConfig }): ResolvedKitConfig {
  const kitConfig: ResolvedKitConfig = config?.kit ?? config ?? {};
  const hooks = kitConfig.files?.hooks;

  return {
    ...kitConfig,
    ...(kitConfig.outDir !== undefined && { outDir: toRelativePosixPath(kitConfig.outDir) }),
    ...(hooks && {
      files: {
        ...kitConfig.files,
        hooks: {
          ...hooks,
          ...(hooks.client !== undefined && { client: toRelativePosixPath(hooks.client) }),
          ...(hooks.server !== undefined && { server: toRelativePosixPath(hooks.server) }),
        },
      },
    }),
  };
}

function toRelativePosixPath(filePath: string): string {
  const relativePath = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
  return relativePath.split(path.sep).join('/');
}

/**
 * Whether SvelteKit's native server-side tracing is enabled. If it is, we must not add our own
 * server-side instrumentation on top of SvelteKit's, or we'd emit duplicate spans.
 */
export function isNativeServerTracingEnabled(kitConfig: ResolvedKitConfig): boolean {
  return !!(kitConfig.tracing?.server || kitConfig.experimental?.tracing?.server);
}
