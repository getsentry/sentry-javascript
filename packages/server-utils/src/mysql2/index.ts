import { defineIntegration, type IntegrationFn } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { subscribeMysql2DiagnosticChannels } from './mysql2-dc-subscriber';

const _mysql2Integration = (() => {
  return {
    name: 'Mysql2',
    setupOnce() {
      // Bail on Node <= 18.18.0, where `tracingChannel` does not exist.
      if (!dc.tracingChannel) {
        return;
      }

      // Subscribe to mysql2's native tracing channels (mysql2 >= 3.20.0).
      // This is a no-op on versions that don't publish to the channels, so it is always safe to call.
      // `bindTracingChannelToSpan` (inside the subscriber) makes the span the active context via
      // `bindStore`, which needs the Sentry OTel context manager — `initOpenTelemetry()` registers
      // that after `setupOnce`, so defer a tick.
      void Promise.resolve().then(() => subscribeMysql2DiagnosticChannels(dc.tracingChannel));
    },
  };
}) satisfies IntegrationFn;

/**
 * Auto-instrument the [mysql2](https://www.npmjs.com/package/mysql2) library via its native
 * `node:diagnostics_channel` tracing channels (mysql2 >= 3.20.0).
 *
 * On older mysql2 versions the channels are never published to, so this integration is inert and
 * the vendored OTel instrumentation (gated to `< 3.20.0`) handles instrumentation instead.
 */
export const mysql2Integration = defineIntegration(_mysql2Integration);
