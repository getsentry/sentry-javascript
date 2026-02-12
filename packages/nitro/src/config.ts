import type { Options as SentryBundlerPluginOptions } from '@sentry/bundler-plugin-core';
import type { NitroConfig } from 'nitro/types';
import { createNitroModule } from './module';
import { configureSourcemapSettings } from './sourceMaps';

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

  configureSourcemapSettings(config, moduleOptions);

  config.modules = config.modules || [];
  config.modules.push(createNitroModule(moduleOptions));

  return config;
}
