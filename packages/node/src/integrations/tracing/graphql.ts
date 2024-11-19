import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration, getRootSpan, spanToJSON } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

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

const INTEGRATION_NAME = 'Graphql';

export const instrumentGraphql = generateInstrumentOnce<GraphqlOptions>(
  INTEGRATION_NAME,
  (_options: GraphqlOptions = {}) => {
    const options = getOptionsWithDefaults(_options);

    return new GraphQLInstrumentation({
      ...options,
      responseHook(span) {
        addOriginToSpan(span, 'auto.graphql.otel.graphql');

        const attributes = spanToJSON(span).data || {};

        // If operation.name is not set, we fall back to use operation.type only
        const operationType = attributes['graphql.operation.type'];
        const operationName = attributes['graphql.operation.name'];

        if (options.useOperationNameForRootSpan && operationType) {
          const rootSpan = getRootSpan(span);

          // We guard to only do this on http.server spans

          const rootSpanAttributes = spanToJSON(rootSpan).data || {};

          const existingOperations = rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION] || [];

          const newOperation = operationName ? `${operationType} ${operationName}` : `${operationType}`;

          // We keep track of each operation on the root span
          // This can either be a string, or an array of strings (if there are multiple operations)
          if (Array.isArray(existingOperations)) {
            existingOperations.push(newOperation);
            rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, existingOperations);
          } else if (existingOperations) {
            rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, [existingOperations, newOperation]);
          } else {
            rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, newOperation);
          }
        }
      },
    });
  },
);

const _graphqlIntegration = ((options: GraphqlOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // We set defaults here, too, because otherwise we'd update the instrumentation config
      // to the config without defaults, as `generateInstrumentOnce` automatically calls `setConfig(options)`
      // when being called the second time
      instrumentGraphql(getOptionsWithDefaults(options));
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [graphql](https://www.npmjs.com/package/graphql) library.
 *
 * For more information, see the [`graphqlIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/graphql/).
 *
 * @param {GraphqlOptions} options Configuration options for the GraphQL integration.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.graphqlIntegration()],
 * });
 */
export const graphqlIntegration = defineIntegration(_graphqlIntegration);

function getOptionsWithDefaults(options?: GraphqlOptions): GraphqlOptions {
  return {
    ignoreResolveSpans: true,
    ignoreTrivialResolveSpans: true,
    useOperationNameForRootSpan: true,
    ...options,
  };
}
