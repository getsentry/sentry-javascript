import type { NitroModule } from 'nitro/types';
import type { SentryNitroOptions } from './config';
import { instrumentServer } from './instruments/instrumentServer';
import { setupSourceMaps } from './sourceMaps';

/**
 * Creates a Nitro module to setup the Sentry SDK.
 */
export function createNitroModule(sentryOptions?: SentryNitroOptions): NitroModule {
  return {
    name: 'sentry',
    setup: nitro => {
      instrumentServer(nitro);
      setupSourceMaps(nitro, sentryOptions);
    },
  };
}
