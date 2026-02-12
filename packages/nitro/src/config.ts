import type { Options as SentryBundlerPluginOptions } from '@sentry/bundler-plugin-core';
import { debug } from '@sentry/core';
import type { NitroConfig } from 'nitro/types';
import { createNitroModule } from './module';

export type SentryNitroOptions = Pick<
  SentryBundlerPluginOptions,
  | 'org'
  | 'project'
  | 'authToken'
  | 'url'
  | 'headers'
  | 'debug'
  | 'silent'
  | 'errorHandler'
  | 'telemetry'
  | 'disable'
  | 'sourcemaps'
  | 'release'
  | 'bundleSizeOptimizations'
  | '_metaOptions'
>;

/**
 * Modifies the passed in Nitro configuration with automatic build-time instrumentation.
 */
export function withSentryConfig(config: NitroConfig, sentryOptions?: SentryNitroOptions): NitroConfig {
  return setupSentryNitroModule(config, sentryOptions);
}

/**
 * Sets up the Sentry Nitro module, useful for meta framework integrations.
 */
export function setupSentryNitroModule(
  config: NitroConfig,
  moduleOptions?: SentryNitroOptions,
  _serverConfigFile?: string,
): NitroConfig {
  // @ts-expect-error Nitro tracing config is not out yet
  if (!config.tracing) {
    // @ts-expect-error Nitro tracing config is not out yet
    config.tracing = true;
  }

  const sourcemapUploadDisabled = moduleOptions?.sourcemaps?.disable === true || moduleOptions?.disable === true;

  if (!sourcemapUploadDisabled) {
    configureSourcemapSettings(config, moduleOptions);
  }

  config.modules = config.modules || [];
  config.modules.push(createNitroModule(moduleOptions));

  return config;
}

function configureSourcemapSettings(config: NitroConfig, moduleOptions?: SentryNitroOptions): void {
  if (config.sourcemap === false) {
    debug.warn(
      '[Sentry] You have explicitly disabled source maps (`sourcemap: false`). Sentry is overriding this to `true` so that errors can be un-minified in Sentry. To disable Sentry source map uploads entirely, use `sourcemaps: { disable: true }` in your Sentry options instead.',
    );
  }
  config.sourcemap = true;

  // Nitro v3 has a `sourcemapMinify` plugin that destructively deletes `sourcesContent`,
  // `x_google_ignoreList`, and clears `mappings` for any chunk containing `node_modules`.
  // This makes sourcemaps unusable for Sentry.
  config.experimental = config.experimental || {};
  config.experimental.sourcemapMinify = false;

  if (moduleOptions?.debug) {
    debug.log('[Sentry] Enabled source map generation and configured build settings for Sentry source map uploads.');
  }
}
