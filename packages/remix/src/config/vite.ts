import * as path from 'path';
import type { Plugin } from 'vite';
import { createRemixRouteManifest } from './createRemixRouteManifest';

/**
 * Escapes a JSON string for safe embedding in HTML script tags.
 * JSON.stringify alone doesn't escape </script> or <!-- which can break out of script context.
 */
function escapeJsonForHtml(jsonString: string): string {
  return jsonString
    .replace(/<\//g, '<\\/') // Escape </ to prevent </script> injection
    .replace(/<!--/g, '<\\!--'); // Escape <!-- to prevent HTML comment injection
}

export type SentryRemixVitePluginOptions = {
  /**
   * Path to the app directory (where routes folder is located).
   * Can be relative to project root or absolute.
   * Defaults to 'app' in the project root.
   *
   * @example './app'
   * @example '/absolute/path/to/app'
   */
  appDirPath?: string;
};

// Global variable key used to store the route manifest
const MANIFEST_GLOBAL_KEY = '_sentryRemixRouteManifest' as const;

/**
 * Vite plugin to inject Remix route manifest for Sentry client-side route parameterization.
 *
 * @param options - Plugin configuration options
 * @returns Vite plugin
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { vitePlugin as remix } from '@remix-run/dev';
 * import { sentryRemixVitePlugin } from '@sentry/remix';
 *
 * export default defineConfig({
 *   plugins: [
 *     remix(),
 *     sentryRemixVitePlugin({
 *       appDirPath: './app',
 *     }),
 *   ],
 * });
 * ```
 */
export function sentryRemixVitePlugin(options: SentryRemixVitePluginOptions = {}): Plugin {
  let routeManifestJson: string = '';
  let isDevMode = false;

  return {
    name: 'sentry-remix-route-manifest',
    enforce: 'post',

    configResolved(config) {
      isDevMode = config.command === 'serve' || config.mode === 'development';

      try {
        const rootDir = config.root || process.cwd();

        let resolvedAppDirPath = options.appDirPath;
        if (resolvedAppDirPath && !path.isAbsolute(resolvedAppDirPath)) {
          resolvedAppDirPath = path.resolve(rootDir, resolvedAppDirPath);
        }

        const manifest = createRemixRouteManifest({
          appDirPath: resolvedAppDirPath,
          rootDir,
        });

        routeManifestJson = JSON.stringify(manifest);

        if (isDevMode) {
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry Remix] Found ${manifest.staticRoutes.length} static and ${manifest.dynamicRoutes.length} dynamic routes`,
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Sentry Remix] Failed to generate route manifest:', error);
        routeManifestJson = JSON.stringify({ dynamicRoutes: [], staticRoutes: [] });
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!routeManifestJson) {
          return html;
        }

        /**
         * XSS Prevention: JSON.stringify escapes quotes/backslashes, but we also need to escape
         * HTML-dangerous sequences like </script> and <!-- that could break out of the script context.
         */
        const safeJsonValue = escapeJsonForHtml(JSON.stringify(routeManifestJson));
        const script = `<script>window.${MANIFEST_GLOBAL_KEY} = ${safeJsonValue};</script>`;

        if (/<head>/i.test(html)) {
          return html.replace(/<head>/i, match => `${match}\n  ${script}`);
        }

        if (/<html[^>]*>/i.test(html)) {
          return html.replace(/<html[^>]*>/i, match => `${match}\n<head>${script}</head>`);
        }

        return `<!DOCTYPE html><html><head>${script}</head><body>${html}</body></html>`;
      },
    },

    transform(code, id) {
      if (!routeManifestJson) {
        return null;
      }

      const isClientEntry =
        /entry[.-]client\.[jt]sx?$/.test(id) ||
        // Also handle Remix's default entry.client location
        id.includes('/entry.client.') ||
        id.includes('/entry-client.');

      const isServerEntry =
        /entry[.-]server\.[jt]sx?$/.test(id) ||
        // Also handle Remix's default entry.server location
        id.includes('/entry.server.') ||
        id.includes('/entry-server.') ||
        // Also handle Hydrogen/Cloudflare Workers server files
        /(^|\/)server\.[jt]sx?$/.test(id);

      if (isClientEntry) {
        // XSS Prevention: Escape HTML-dangerous sequences in addition to JSON escaping
        const safeJsonValue = escapeJsonForHtml(JSON.stringify(routeManifestJson));
        const injectedCode = `
// Sentry Remix Route Manifest - Auto-injected
if (typeof window !== 'undefined') {
  window.${MANIFEST_GLOBAL_KEY} = window.${MANIFEST_GLOBAL_KEY} || ${safeJsonValue};
}
${code}`;

        return {
          code: injectedCode,
          map: null,
        };
      }

      if (isServerEntry) {
        // Inject into server entry for server-side transaction naming
        // Use globalThis for Cloudflare Workers/Hydrogen compatibility
        // XSS Prevention: Escape HTML-dangerous sequences (important if server renders this)
        const safeJsonValue = escapeJsonForHtml(JSON.stringify(routeManifestJson));
        const injectedCode = `
// Sentry Remix Route Manifest - Auto-injected
if (typeof globalThis !== 'undefined') {
  globalThis.${MANIFEST_GLOBAL_KEY} = globalThis.${MANIFEST_GLOBAL_KEY} || ${safeJsonValue};
}
${code}`;

        return {
          code: injectedCode,
          map: null,
        };
      }

      return null;
    },
  };
}
