import { defineIntegration } from '@sentry/core';
import type { NestCronMonitoringOptions } from './cron-monitoring';
import { setCronMonitoringOptions } from './cron-monitoring';
import { subscribeToNestChannels } from './orchestrion-subscriber';

const INTEGRATION_NAME = 'Nest' as const;

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
    },
  };
});
