import type { NitroConfig } from 'nitro/types';
import { createNitroModule } from './module';

type SentryNitroOptions = {
  // TODO: Add options
};

/**
 * Modifies the passed in Nitro configuration with automatic build-time instrumentation.
 *
 * @param config A Nitro configuration object, as usually exported in `nitro.config.ts` or `nitro.config.mjs`.
 * @returns The modified config to be exported
 */
export function withSentryConfig(config: NitroConfig, moduleOptions?: SentryNitroOptions): NitroConfig {
  setupSentryNitroModule(config, moduleOptions);

  return config;
}

/**
 * Sets up the Sentry Nitro module, useful for meta framework integrations.
 */
export function setupSentryNitroModule(
  config: NitroConfig,
  _moduleOptions?: SentryNitroOptions,
  _serverConfigFile?: string,
): NitroConfig {
  config.modules = config.modules || [];
  config.modules.push(createNitroModule());

  return config;
}
