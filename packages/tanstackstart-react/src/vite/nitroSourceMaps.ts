import { readFile } from 'node:fs/promises';
import type { Plugin, UserConfig } from 'vite';

type ViteConfigWithNitro = UserConfig & { nitro?: Record<string, unknown> };
type NitroSourceMapOptions = { debug?: boolean };

export function rewriteTanstackStartSources(source: string): string {
  return source.replace(/\?tss-[^?]*/g, '').replace(/^(\.\.\/)+/, './');
}

/**
 * Configures Nitro so the final server bundle's source maps compose back to TypeScript.
 *
 * `enforce: 'pre'` is load-bearing: Nitro creates its instance inside its own `config` hook, so a
 * normal-priority hook sorting after it would be read too late and silently ignored.
 *
 * Only Sentry's additions are returned. Vite concatenates arrays when merging a `config` return
 * value, so echoing the user's own `plugins` back would duplicate every entry.
 */
export function makeNitroSourceMapsPlugin(options: NitroSourceMapOptions = {}): Plugin {
  return {
    name: 'sentry-tanstackstart-nitro-source-maps',
    apply: 'build',
    enforce: 'pre',
    config(userConfig: ViteConfigWithNitro) {
      return {
        nitro: getNitroSourceMapConfig(userConfig.nitro, options),
      } as Omit<UserConfig, 'plugins'>;
    },
  };
}

function getNitroSourceMapConfig(
  userNitro: Record<string, unknown> | undefined,
  options: NitroSourceMapOptions,
): Record<string, unknown> {
  const userSourcemap = userNitro?.sourcemap;
  const debug = options.debug;

  if (userSourcemap === false) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your Nitro configuration (\`nitro.sourcemap: false\`). Sentry won't override this setting. Without source maps, server code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your Nitro configuration.');
    }
    return {};
  }

  if (userSourcemap === 'inline') {
    // eslint-disable-next-line no-console
    console.warn(
      '[Sentry] You have set `nitro.sourcemap: "inline"`. Inline source maps are embedded in the output bundle, so there are no `.map` files to upload. Set `nitro.sourcemap: "hidden"` (or leave it unset) to let Sentry upload server source maps.',
    );
    return {};
  }

  const nitro: Record<string, unknown> = {
    // Nitro v3's sourcemapMinify plugin clears `mappings` for any chunk containing `node_modules`.
    // TanStack Start's intermediate SSR files live under `node_modules/.nitro/`, so leaving this on
    // produces empty server maps.
    experimental: { sourcemapMinify: false },
    rollupConfig: {
      plugins: [makeLoadIntermediateSsrSourcemapsPlugin()],
    },
  };

  if (userSourcemap === true || userSourcemap === 'hidden') {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Nitro source maps are already enabled (\`nitro.sourcemap: ${JSON.stringify(userSourcemap)}\`). Sentry will keep this setting.`,
      );
    }
    return nitro;
  }

  nitro.sourcemap = 'hidden';
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      "[Sentry] Enabled hidden Nitro source map generation (`nitro.sourcemap: 'hidden'`). Source map files will be deleted after they were uploaded to Sentry.",
    );
  }

  return nitro;
}

/**
 * Nitro's final Rollup pass treats intermediate Vite SSR output as plain JS. Adjacent `.map` files
 * are ignored, so the uploaded maps would point at `node_modules/.nitro/vite/services/ssr/` instead
 * of the original TypeScript. Returning `{ code, map }` lets Rollup compose through to source.
 */
function makeLoadIntermediateSsrSourcemapsPlugin(): {
  name: string;
  load: (id: string) => Promise<{ code: string; map: string } | null>;
} {
  return {
    name: 'sentry-tanstackstart-load-intermediate-ssr-sourcemaps',
    async load(id: string) {
      if (!isNitroSsrIntermediate(id)) {
        return null;
      }

      try {
        const [code, map] = await Promise.all([readFile(id, 'utf8'), readFile(`${id}.map`, 'utf8')]);
        return { code, map };
      } catch {
        return null;
      }
    },
  };
}

function isNitroSsrIntermediate(id: string): boolean {
  if (!id.endsWith('.js')) {
    return false;
  }

  return id.includes('/.nitro/vite/services/ssr/') || id.includes('.nitro\\vite\\services\\ssr\\');
}
