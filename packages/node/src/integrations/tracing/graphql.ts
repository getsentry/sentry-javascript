import { SpanKind } from '@opentelemetry/api';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration, getRootSpan, spanToJSON } from '@sentry/core';
import { spanHasKind } from '@sentry/opentelemetry';
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

  /**
   * By default, an incoming GraphQL request will have a http.server root span,
   * which has one or multiple GraphQL operation spans as children.
   * If you want your http.server root span to have the name of the GraphQL operation,
   * you can opt-in to this behavior by setting this option to true.
   *
   * Please note that this may not work as expected if you have multiple GraphQL operations -
   * the last operation to come in will determine the root span name in this scenario.
   */
  useOperationNameForRootSpan?: boolean;
}

const INTEGRATION_NAME = 'Graphql';

export const instrumentGraphql = generateInstrumentOnce<GraphqlOptions>(
  INTEGRATION_NAME,
  (_options: GraphqlOptions = {}) => {
    const options = {
      ignoreResolveSpans: true,
      ignoreTrivialResolveSpans: true,
      useOperationNameForRootSpan: false,
      ..._options,
    };

    return new GraphQLInstrumentation({
      ...options,
      responseHook(span) {
        addOriginToSpan(span, 'auto.graphql.otel.graphql');

        const attributes = spanToJSON(span).data || {};

        // If operation.name is not set, we fall back to use operation.type only
        const operationType = attributes['graphql.operation.type'];
        const operationName = attributes['graphql.operation.name'];

        if (options.useOperationNameForRootSpan && operationType) {
          const rootSpanName = `${operationType}${operationName ? ` ${operationName}` : ''}`;
          const rootSpan = getRootSpan(span);

          // We guard to only do this on http.server spans
          if (
            spanToJSON(rootSpan).data?.['http.method'] &&
            spanHasKind(rootSpan) &&
            rootSpan.kind === SpanKind.SERVER
          ) {
            // Ensure the default http.server span name inferral is skipped
            rootSpan.setAttribute('sentry.skip_span_data_inference', true);
            rootSpan.updateName(rootSpanName);
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
