import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration, getRootSpan, spanToJSON } from '@sentry/core';
import { parseSpanDescription } from '@sentry/opentelemetry';
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
   * If there are multiple operations in a single http.server request, the first one will take precedence.
   *
   * Defaults to true.
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
      useOperationNameForRootSpan: true,
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
          const rootSpan = getRootSpan(span);
          const rootSpanDescription = parseSpanDescription(rootSpan);

          // We guard to only do this on http.server spans, and only if we have not already set the operation name
          if (
            parseSpanDescription(rootSpan).op === 'http.server' &&
            !spanToJSON(rootSpan).data?.['sentry.skip_span_data_inference']
          ) {
            const rootSpanName = `${rootSpanDescription.description} (${operationType}${
              operationName ? ` ${operationName}` : ''
            })`;

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
