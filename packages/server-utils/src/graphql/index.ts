import { defineIntegration, type IntegrationFn, waitForTracingChannelBinding } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { type GraphqlDiagnosticChannelsOptions, subscribeGraphqlDiagnosticChannels } from './graphql-dc-subscriber';

const _graphqlIntegration = ((options: GraphqlDiagnosticChannelsOptions = {}) => {
  return {
    name: 'Graphql',
    setupOnce() {
      // Bail on Node <= 18.18.0, where `tracingChannel` does not exist.
      if (!dc.tracingChannel) {
        return;
      }

      // Subscribe to graphql's native tracing channels (graphql >= 17).
      // This is a no-op on versions that don't publish to the channels, so it is always safe to call.
      waitForTracingChannelBinding(() => {
        subscribeGraphqlDiagnosticChannels(dc.tracingChannel, options);
      });
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
export const graphqlIntegration = defineIntegration(_graphqlIntegration);
