import { defineIntegration, type IntegrationFn } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { type GraphqlDiagnosticChannelsOptions, subscribeGraphqlDiagnosticChannels } from './graphql-dc-subscriber';

const _graphqlChannelIntegration = ((options: GraphqlDiagnosticChannelsOptions = {}) => {
  return {
    name: 'Graphql',
    setupOnce() {
      // Bail on Node <= 18.18.0, where `tracingChannel` does not exist.
      if (!dc.tracingChannel) {
        return;
      }

      // Subscribe to graphql's native tracing channels (graphql >= 17).
      // This is a no-op on versions that don't publish to the channels, so it is always safe to call.
      // `bindTracingChannelToSpan` (inside the subscriber) makes the span the active context via
      // `bindStore`, which needs the Sentry OTel context manager — `initOpenTelemetry()` registers
      // that after `setupOnce`, so defer a tick.
      void Promise.resolve().then(() => subscribeGraphqlDiagnosticChannels(dc.tracingChannel, options));
    },
  };
}) satisfies IntegrationFn;

/**
 * Auto-instrument the [graphql](https://www.npmjs.com/package/graphql) library via its native
 * `node:diagnostics_channel` tracing channels (graphql >= 17).
 *
 * On older graphql versions the channels are never published to, so this integration is inert and
 * the vendored OTel instrumentation (gated to `< 17`) handles instrumentation instead.
 */
export const graphqlChannelIntegration = defineIntegration(_graphqlChannelIntegration);
