import type { NitroConfig } from 'nitropack/types';
import { SentryNitroModule } from './module';

/**
 * Modifies the passed in Nitro configuration with automatic build-time instrumentation.
 *
 * @param config A Nitro configuration object, as usually exported in `nitro.config.ts` or `nitro.config.mjs`.
 * @returns The modified config to be exported
 */
export function withSentryConfig(config: NitroConfig): NitroConfig {
  config.modules?.push(SentryNitroModule);

  return config;
}
