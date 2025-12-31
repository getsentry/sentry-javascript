import type { NitroModule } from 'nitro/types';
import { instrumentServer } from './instruments/instrumentServer';

/**
 * Creates a Nitro module to setup the Sentry SDK.
 */
export function createNitroModule(): NitroModule {
  return {
    name: 'sentry',
    setup: nitro => {
      instrumentServer(nitro);
    },
  };
}
