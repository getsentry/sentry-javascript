import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { subscribeGraphqlDiagnosticChannels, type GraphQLOptions } from './graphql-dc-subscriber';
import { CHANNELS } from '../../orchestrion/channels';
import { graphqlModuleNames } from '../../orchestrion/config/graphql';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel';
import {
  finalizeExecuteSpan,
  finalizeValidateSpan,
  startExecuteSpan,
  startParseSpan,
  startValidateSpan,
} from './spans';
import type { GraphqlResolvedConfig } from './types';

// Same name as the OTel/native integration by design, so enabling injection swaps this in for it.
const INTEGRATION_NAME = 'Graphql' as const;

// The context orchestrion's transform attaches to each channel: `arguments` is the live args of the
// wrapped call, `result` the settled return value.
interface GraphqlChannelContext {
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
  error?: unknown;
}

function getOptionsWithDefaults(options: GraphQLOptions): GraphqlResolvedConfig {
  return {
    ignoreResolveSpans: options.ignoreResolveSpans !== false,
    ignoreTrivialResolveSpans: options.ignoreTrivialResolveSpans !== false,
    useOperationNameForRootSpan: options.useOperationNameForRootSpan !== false,
  };
}

const _graphqlIntegration = ((options: GraphQLOptions = {}) => {
  const config = getOptionsWithDefaults(options);
  const getConfig = (): GraphqlResolvedConfig => config;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, graphqlModuleNames, instrumentGraphql, [config, getConfig]);
    },
    setupOnce() {
      setupNativeGraphQLInstrumentation(options);
    },
  };
}) satisfies IntegrationFn;

function instrumentGraphql(config: GraphqlResolvedConfig, getConfig: () => GraphqlResolvedConfig): void {
  bindTracingChannelToSpan(diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_PARSE), () =>
    safeChannelCallback(() => startParseSpan()),
  );

  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_VALIDATE),
    data => safeChannelCallback(() => startValidateSpan(data.arguments[1])),
    { beforeSpanEnd: (span, data) => safeChannelCallback(() => finalizeValidateSpan(span, data.result)) },
  );

  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_EXECUTE),
    data => safeChannelCallback(() => startExecuteSpan(data.arguments, data.self, config, getConfig)),
    { beforeSpanEnd: (span, data) => safeChannelCallback(() => finalizeExecuteSpan(span, data.result)) },
  );
}

function setupNativeGraphQLInstrumentation(options: GraphQLOptions) {
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  // Subscribe to graphql's native tracing channels (graphql >= 17).
  // This is a no-op on versions that don't publish to the channels, so it is always safe to call.
  waitForTracingChannelBinding(() => {
    subscribeGraphqlDiagnosticChannels(diagnosticsChannel.tracingChannel, options);
  });
}

/**
 * Instrument the graphql library.
 * This works for graphql v14-v17.
 */
export const graphqlIntegration = defineIntegration(_graphqlIntegration);
