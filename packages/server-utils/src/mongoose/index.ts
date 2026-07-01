import { defineIntegration, type IntegrationFn, waitForTracingChannelBinding } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { subscribeMongooseDiagnosticChannels } from './mongoose-dc-subscriber';

const _mongooseIntegration = (() => {
  return {
    name: 'Mongoose',
    setupOnce() {
      // Bail on Node <= 18.18.0, where `tracingChannel` does not exist.
      if (!dc.tracingChannel) {
        return;
      }

      // Subscribe to mongoose's native tracing channels (mongoose >= 9.7).
      // This is a no-op on versions that don't publish to the channels, so it is always safe to call.
      waitForTracingChannelBinding(() => {
        subscribeMongooseDiagnosticChannels(dc.tracingChannel);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Auto-instrument the [mongoose](https://www.npmjs.com/package/mongoose) library via its native
 * `node:diagnostics_channel` tracing channels (mongoose >= 9.7).
 *
 * On older mongoose versions the channels are never published to, so this integration is inert and
 * the IITM-based patcher (gated to `< 9.7.0`) handles instrumentation instead.
 */
export const mongooseIntegration = defineIntegration(_mongooseIntegration);
