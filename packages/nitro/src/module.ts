import { _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults } from '@sentry/core/server';
import type { NitroModule } from 'nitro/types';
import type { SentryNitroOptions } from './config';
import { instrumentServer } from './instruments/instrumentServer';
import { setupSourceMaps } from './sourceMaps';

/**
 * Creates a Nitro module to setup the Sentry SDK.
 */
export function createNitroModule(sentryOptions?: SentryNitroOptions, sentryEnabledSourcemaps?: boolean): NitroModule {
  return {
    name: 'sentry',
    setup: nitro => {
      instrumentServer(nitro);
      setupSourceMaps(nitro, sentryOptions, sentryEnabledSourcemaps);

      // In dev, Vite's server takes each request in this process before Nitro handles it, and its `http.server` span
      // comes from the SDK `--import` set up here. The runtime plugin only reaches the client where Nitro runs.
      if (nitro.options.dev) {
        // `sentryTunnelBasePath` is set by `@sentry/solidstart`, whose app is served under Vite's `base`.
        const tunnelBasePath = nitro.options.runtimeConfig.sentryTunnelBasePath as string | undefined;
        setManagedTunnelDefaults({ basePath: tunnelBasePath || nitro.options.baseURL });
      }
    },
  };
}
