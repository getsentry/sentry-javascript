import type { BuildTimeOptionsBase } from '@sentry/core';
import type { NitroConfig } from 'nitro/types';
import { createNitroModule } from './module';
import { createOrchestrionModule } from './orchestrion';
import { configureSourcemapSettings } from './sourceMaps';

export type SentryNitroOptions = BuildTimeOptionsBase;

/**
 * Modifies the passed in Nitro configuration with automatic build-time instrumentation.
 */
export function withSentryConfig(config: NitroConfig, sentryOptions?: SentryNitroOptions): NitroConfig {
  const sentryConfig = setupSentryNitroModule(config, sentryOptions);

  // Not part of `setupSentryNitroModule`, as framework SDKs that use it add the transform themselves.
  if (sentryOptions?.buildTimeInstrumentation !== false) {
    sentryConfig.modules?.push(createOrchestrionModule());
  }

  return sentryConfig;
}

/**
 * Sets up the Sentry Nitro module, useful for meta framework integrations.
 */
export function setupSentryNitroModule(
  config: NitroConfig,
  moduleOptions?: SentryNitroOptions,
  _serverConfigFile?: string,
): NitroConfig {
  if (!config.tracingChannel) {
    config.tracingChannel = true;
  }

  const { sentryEnabledSourcemaps } = configureSourcemapSettings(config, moduleOptions);

  config.modules = config.modules || [];
  config.modules.push(createNitroModule(moduleOptions, sentryEnabledSourcemaps));

  return config;
}
