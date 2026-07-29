import { defineIntegration } from '@sentry/core';
import { subscribeToNestChannels } from './orchestrion-subscriber';

const INTEGRATION_NAME = 'Nest' as const;

/**
 * Integration capturing tracing data for NestJS.
 *
 * Instrumentation is channel-based: it subscribes to the diagnostics channels
 * that orchestrion injects into `@nestjs/*` (via the runtime hook installed by
 * `Sentry.init()` or a bundler plugin). See the shared `./wrap-*` helpers.
 */
export const nestIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      subscribeToNestChannels();
    },
  };
});
