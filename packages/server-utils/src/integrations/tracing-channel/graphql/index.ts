import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { graphqlIntegration as graphqlNativeIntegration } from '../../../graphql';
import type { GraphqlDiagnosticChannelsOptions } from '../../../graphql/graphql-dc-subscriber';

import { instrumentGraphql } from './instrumentation';
import { invokeOrchestrionInstrumentation } from '../../../orchestrion/instrumentation';
import { graphqlModuleNames } from '../../../orchestrion/config/graphql';

// Same name as the OTel/native integration by design, so enabling injection swaps this in for it.
const INTEGRATION_NAME = 'Graphql' as const;

const _graphqlChannelIntegration = ((options: GraphqlDiagnosticChannelsOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, graphqlModuleNames, instrumentGraphql, [options]);
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

/**
 * The complete graphql diagnostics-channel integration: the native subscriber (graphql v17) composed
 * with the orchestrion subscriber (v14–16), so opting into injection instruments every supported
 * version via diagnostics channels without the OTel patcher. Reuses the OTel `Graphql` name so
 * enabling injection swaps this in for it.
 */
export const graphqlDiagnosticsChannelIntegration = (options?: GraphqlDiagnosticChannelsOptions) => {
  const orchestrion = graphqlChannelIntegration(options);
  const graphqlNative = graphqlNativeIntegration(options);
  return extendIntegration(orchestrion, { ...graphqlNative });
};
