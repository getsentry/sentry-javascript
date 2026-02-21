import type { NitroModule } from 'nitro/types';

/**
 * Creates a Nitro module to setup the Sentry SDK.
 */
export function createNitroModule(): NitroModule {
  return {
    name: 'sentry',
    setup: _nitro => {
      // TODO: Setup the Sentry SDK.
    },
  };
}
