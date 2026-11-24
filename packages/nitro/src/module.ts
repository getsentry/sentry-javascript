import { setIsNitroDevServer, setTunnelDefaults } from '@sentry/core/server';
import { runsNitroInWorker } from '@sentry/server-utils';
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

      // In dev, this process runs the dev server (Vite's for `vite dev`), which takes each request before Nitro handles
      // it. The SDK `--import` sets up its client, and the runtime plugin only reaches the client where Nitro runs.
      if (nitro.options.dev) {
        // The worker that the `--import` sets up too traces each request.
        if (runsNitroInWorker(nitro)) {
          setIsNitroDevServer();
        }

        // `sentryTunnelBasePath` is set by `@sentry/solidstart`, whose app is served under Vite's `base`.
        const tunnelBasePath = nitro.options.runtimeConfig.sentryTunnelBasePath as string | undefined;
        setTunnelDefaults({ basePath: tunnelBasePath || nitro.options.baseURL });
      }
    },
  };
}
