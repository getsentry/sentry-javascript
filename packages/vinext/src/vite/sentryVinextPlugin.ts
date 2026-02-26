import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin, UserConfig } from 'vite';
import { makeAutoInstrumentationPlugin } from './autoInstrumentation';
import type { SentryVinextPluginOptions } from './types';

const DEFAULT_OPTIONS: SentryVinextPluginOptions = {
  autoUploadSourceMaps: true,
  autoInstrument: true,
};

/**
 * Sentry Vite plugin for vinext applications.
 *
 * Handles source map upload and auto-instrumentation of server components,
 * route handlers, and middleware.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryVinext } from '@sentry/vinext';
 * import vinext from 'vinext';
 *
 * export default defineConfig({
 *   plugins: [
 *     vinext(),
 *     sentryVinext({
 *       org: 'my-org',
 *       project: 'my-project',
 *       authToken: process.env.SENTRY_AUTH_TOKEN,
 *     }),
 *   ],
 * });
 * ```
 */
export async function sentryVinext(options: SentryVinextPluginOptions = {}): Promise<Plugin[]> {
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const sentryPlugins: Plugin[] = [];

  if (mergedOptions.autoInstrument) {
    sentryPlugins.push(makeAutoInstrumentationPlugin(mergedOptions.autoInstrument));
  }

  sentryPlugins.push(makeSourceMapSettingsPlugin(mergedOptions));

  if (mergedOptions.autoUploadSourceMaps && process.env.NODE_ENV !== 'development') {
    const vitePluginOptions = buildSentryVitePluginOptions(mergedOptions);
    if (vitePluginOptions) {
      const uploadPlugins = await sentryVitePlugin(vitePluginOptions);
      sentryPlugins.push(...uploadPlugins);
    }
  }

  return sentryPlugins;
}

function makeSourceMapSettingsPlugin(options: SentryVinextPluginOptions): Plugin {
  return {
    name: 'sentry-vinext-source-map-settings',
    apply: 'build',
    config(config: UserConfig) {
      const currentSourceMap = config.build?.sourcemap;

      if (currentSourceMap === false) {
        if (options.debug) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Sentry] Source map generation is disabled in your Vite config. Sentry will not override this. Without source maps, code snippets on the Sentry Issues page will remain minified.',
          );
        }
        return config;
      }

      if (currentSourceMap && ['hidden', 'inline', true].includes(currentSourceMap as string | boolean)) {
        return config;
      }

      return {
        ...config,
        build: {
          ...config.build,
          sourcemap: 'hidden',
        },
      };
    },
  };
}

function buildSentryVitePluginOptions(options: SentryVinextPluginOptions): SentryVitePluginOptions | null {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    autoInstrument: _ai,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    autoUploadSourceMaps: _au,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bundleSizeOptimizations: _bso,
    ...vitePluginOptions
  } = options;

  if (!vitePluginOptions.org && !process.env.SENTRY_ORG) {
    return null;
  }

  return {
    ...vitePluginOptions,
    _metaOptions: {
      telemetry: {
        metaFramework: 'vinext',
      },
    },
  };
}
