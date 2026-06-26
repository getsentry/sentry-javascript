import { defineIntegration, type IntegrationFn } from '@sentry/core';
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
      // `bindTracingChannelToSpan` (inside the subscriber) makes the span the active context via
      // `bindStore`, which needs the Sentry OTel context manager — `initOpenTelemetry()` registers
      // that after `setupOnce`, so defer a tick.
      void Promise.resolve().then(() => subscribeMongooseDiagnosticChannels(dc.tracingChannel));
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
