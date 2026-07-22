import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { graphqlIntegration as graphqlNativeIntegration } from '../../../graphql';
import type { GraphqlDiagnosticChannelsOptions } from '../../../graphql/graphql-dc-subscriber';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../../tracing-channel';
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

function getOptionsWithDefaults(options: GraphqlDiagnosticChannelsOptions): GraphqlResolvedConfig {
  return {
    ignoreResolveSpans: options.ignoreResolveSpans !== false,
    ignoreTrivialResolveSpans: options.ignoreTrivialResolveSpans !== false,
    useOperationNameForRootSpan: options.useOperationNameForRootSpan !== false,
  };
}

const _graphqlChannelIntegration = ((options: GraphqlDiagnosticChannelsOptions = {}) => {
  const config = getOptionsWithDefaults(options);
  const getConfig = (): GraphqlResolvedConfig => config;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_PARSE), () =>
          safeChannelCallback(() => startParseSpan()),
        );

        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_VALIDATE),
          data => safeChannelCallback(() => startValidateSpan(data.arguments[1])),
          { beforeSpanEnd: (span, data) => void safeChannelCallback(() => finalizeValidateSpan(span, data.result)) },
        );

        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_EXECUTE),
          data => safeChannelCallback(() => startExecuteSpan(data.arguments, data.self, config, getConfig)),
          { beforeSpanEnd: (span, data) => void safeChannelCallback(() => finalizeExecuteSpan(span, data.result)) },
        );
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven graphql integration for graphql v14–16 (v17 publishes native
 * `diagnostics_channel` events handled by `@sentry/server-utils`'s graphql integration instead).
 *
 * Subscribes to the `orchestrion:graphql:{parse,validate,execute}` channels the orchestrion code
 * transform injects into `graphql`'s `language/parser.js`, `validation/validate.js` and
 * `execution/execute.js`, emitting spans identical to the native path. Requires the orchestrion
 * runtime hook or bundler plugin; `@sentry/node`'s `Sentry.init()` installs the runtime hook by
 * default.
 *
 * @experimental
 */
export const graphqlChannelIntegration = defineIntegration(_graphqlChannelIntegration);

/**
 * The complete graphql diagnostics-channel integration: the native subscriber (graphql v17) composed
 * with the orchestrion subscriber (v14–16), so opting into injection instruments every supported
 * version via diagnostics channels without the OTel patcher. Reuses the OTel `Graphql` name so
 * enabling injection swaps this in for it.
 */
export const graphqlDiagnosticsChannelIntegration = (options?: GraphqlDiagnosticChannelsOptions) => {
  const orchestrion = graphqlChannelIntegration(options);
  return extendIntegration(graphqlNativeIntegration(options), {
    name: INTEGRATION_NAME,
    setupOnce: () => orchestrion.setupOnce?.(),
  });
};
