import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

interface GraphqlOptions {
  /** Do not create spans for resolvers. */
  ignoreResolveSpans?: boolean;

  /**
   * Don't create spans for the execution of the default resolver on object properties.
   *
   * When a resolver function is not defined on the schema for a field, graphql will
   * use the default resolver which just looks for a property with that name on the object.
   * If the property is not a function, it's not very interesting to trace.
   * This option can reduce noise and number of spans created.
   */
  ignoreTrivalResolveSpans?: boolean;
}

const INTEGRATION_NAME = 'Graphql';

export const instrumentGraphql = generateInstrumentOnce<GraphqlOptions>(
  INTEGRATION_NAME,
  (_options: GraphqlOptions = {}) => {
    const options = {
      ignoreResolveSpans: true,
      ignoreTrivialResolveSpans: true,
      ..._options,
    };

    return new GraphQLInstrumentation({
      ...options,
      responseHook(span) {
        addOriginToSpan(span, 'auto.graphql.otel.graphql');
      },
    });
  },
);

const _graphqlIntegration = ((options: GraphqlOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentGraphql(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * GraphQL integration
 *
 * Capture tracing data for GraphQL.
 */
export const graphqlIntegration = defineIntegration(_graphqlIntegration);
