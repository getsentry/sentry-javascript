import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
import {
  finalizeExecuteSpan,
  finalizeParseSpan,
  finalizeValidateSpan,
  startExecuteSpan,
  startParseSpan,
  startValidateSpan,
} from './spans';
import type { GraphqlResolvedConfig } from './types';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Graphql' integration is omitted from the default set.
const INTEGRATION_NAME = 'Graphql' as const;

interface GraphqlOptions {
  /**
   * Do not create spans for resolvers.
   *
   * Defaults to true.
   */
  ignoreResolveSpans?: boolean;

  /**
   * Don't create spans for the execution of the default resolver on object properties.
   *
   * When a resolver function is not defined on the schema for a field, graphql will
   * use the default resolver which just looks for a property with that name on the object.
   * If the property is not a function, it's not very interesting to trace.
   * This option can reduce noise and number of spans created.
   *
   * Defaults to true.
   */
  ignoreTrivialResolveSpans?: boolean;

  /**
   * If this is enabled, a http.server root span containing this span will automatically be renamed to include the operation name.
   * Set this to `false` if you do not want this behavior, and want to keep the default http.server span name.
   *
   * Defaults to true.
   */
  useOperationNameForRootSpan?: boolean;
}

// The shapes orchestrion's transform attaches to each tracing-channel `context`. `arguments` is the
// live args array of the wrapped call; `result` is the settled return value.
interface GraphqlChannelContext {
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
  error?: unknown;
}

function getOptionsWithDefaults(options: GraphqlOptions): GraphqlResolvedConfig {
  return {
    ignoreResolveSpans: options.ignoreResolveSpans ?? true,
    ignoreTrivialResolveSpans: options.ignoreTrivialResolveSpans ?? true,
    useOperationNameForRootSpan: options.useOperationNameForRootSpan ?? true,
  };
}

/**
 * Runs a span-building callback so a failure inside it can never break the user's graphql call.
 * These callbacks run inside the `tracingChannel(...).trace*` machinery that wraps the real graphql
 * function — `getSpan` as the `bindStore` producer, `beforeSpanEnd` in the settle handler — so an
 * unguarded throw (e.g. an exotic schema shape while wrapping resolvers) would propagate into the
 * traced call. On error we drop the span and let graphql run unaffected. Mirrors the OTel
 * instrumentation's `safeExecuteInTheMiddle` guarding that this port replaces.
 */
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    DEBUG_BUILD && debug.warn('[orchestrion:graphql] error building span', error);
    return undefined;
  }
}

const _graphqlChannelIntegration = ((options: GraphqlOptions = {}) => {
  const config = getOptionsWithDefaults(options);
  const getConfig = (): GraphqlResolvedConfig => config;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD &&
        debug.log(
          `[orchestrion:graphql] subscribing to channels "${CHANNELS.GRAPHQL_PARSE}", "${CHANNELS.GRAPHQL_VALIDATE}", "${CHANNELS.GRAPHQL_EXECUTE}"`,
        );

      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_PARSE),
          () => safe(() => startParseSpan()),
          { beforeSpanEnd: (span, data) => void safe(() => finalizeParseSpan(span, data.result)) },
        );

        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_VALIDATE),
          () => safe(() => startValidateSpan()),
          // `documentAST` is the 2nd argument to `validate(schema, documentAST, …)`.
          { beforeSpanEnd: (span, data) => void safe(() => finalizeValidateSpan(span, data.arguments[1])) },
        );

        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<GraphqlChannelContext>(CHANNELS.GRAPHQL_EXECUTE),
          data => safe(() => startExecuteSpan(data.arguments, data.self, config, getConfig)),
          { beforeSpanEnd: (span, data) => void safe(() => finalizeExecuteSpan(span, data.result, config)) },
        );
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven graphql integration.
 *
 * Subscribes to the `orchestrion:graphql:{parse,validate,execute}` diagnostics channels that the
 * orchestrion code transform injects into `graphql`'s `language/parser.js`, `validation/validate.js`
 * and `execution/execute.js`. Requires the orchestrion runtime hook or bundler plugin to be active —
 * wire that up via `experimentalUseDiagnosticsChannelInjection()`.
 *
 * @experimental
 */
export const graphqlChannelIntegration = defineIntegration(_graphqlChannelIntegration);
