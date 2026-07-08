import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import type { GraphqlDiagnosticChannelsOptions } from '../../../graphql/graphql-dc-subscriber';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
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

/**
 * Runs a span-building callback so a throw inside it can never break the user's graphql call: these
 * run inside the `tracingChannel(...).trace*` machinery wrapping the real function (as the `getSpan`
 * producer / `beforeSpanEnd` handler), where an unguarded throw would propagate into the traced call.
 */
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    DEBUG_BUILD && debug.warn('[orchestrion:graphql] error building span', error);
    return undefined;
  }
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
          safe(() => startParseSpan()),
        );

        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_VALIDATE),
          data => safe(() => startValidateSpan(data.arguments[1])),
          { beforeSpanEnd: (span, data) => void safe(() => finalizeValidateSpan(span, data.result)) },
        );

        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_EXECUTE),
          data => safe(() => startExecuteSpan(data.arguments, data.self, config, getConfig)),
          { beforeSpanEnd: (span, data) => void safe(() => finalizeExecuteSpan(span, data.result)) },
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
 * runtime hook or bundler plugin — wire it up via `experimentalUseDiagnosticsChannelInjection()`.
 *
 * @experimental
 */
export const graphqlChannelIntegration = defineIntegration(_graphqlChannelIntegration);
