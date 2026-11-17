import { defineIntegration, SDK_VERSION } from '@sentry/core';
import type { NestCronMonitoringOptions } from './cron-monitoring';
import { setCronMonitoringOptions } from './cron-monitoring';
import { subscribeToNestChannels } from './orchestrion-subscriber';

const INTEGRATION_NAME = 'Nest' as const;
const SDK_NAME = 'sentry.javascript.nestjs';

export type NestIntegrationOptions = NestCronMonitoringOptions;

/**
 * Integration capturing tracing data for NestJS.
 */
export const nestIntegration = defineIntegration((options: NestIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      subscribeToNestChannels();
    },
    setup(client) {
      setCronMonitoringOptions(client, options);

      // On Bun, Deno and Cloudflare, the runtime's SDK inits the client and this integration is
      // added to it. The runtime SDK stays in `packages`.
      const sdk = client.getOptions()._metadata?.sdk;
      if (sdk && sdk.name !== SDK_NAME) {
        sdk.name = SDK_NAME;
        sdk.packages = [{ name: 'npm:@sentry/nestjs', version: SDK_VERSION }, ...(sdk.packages || [])];
      }
    },
  };
});
