import type { NitroConfig } from 'nitropack/types';
import type { SentryNitroOptions } from './common/types';
import { createSentryNitroModule } from './module';

/**
 * Modifies the passed in Nitro configuration with automatic build-time instrumentation.
 *
 * @param config A Nitro configuration object, as usually exported in `nitro.config.ts` or `nitro.config.mjs`.
 * @returns The modified config to be exported
 */
export function withSentryConfig(config: NitroConfig, moduleOptions?: SentryNitroOptions): NitroConfig {
  config.modules = config.modules || [];
  config.modules.push(createSentryNitroModule(moduleOptions));

  return config;
}
