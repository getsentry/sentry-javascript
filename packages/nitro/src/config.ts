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
  return setupSentryNitroModule(config, moduleOptions);
}

/**
 * Sets up the Sentry Nitro module, useful for meta framework integrations.
 */
export function setupSentryNitroModule(
  config: NitroConfig,
  _moduleOptions?: SentryNitroOptions,
  _serverConfigFile?: string,
): NitroConfig {
  // @ts-expect-error Nitro tracing config is not out yet
  if (!config.tracing) {
    // @ts-expect-error Nitro tracing config is not out yet
    config.tracing = true;
  }

  config.modules = config.modules || [];
  config.modules.push(createNitroModule());

  return config;
}
