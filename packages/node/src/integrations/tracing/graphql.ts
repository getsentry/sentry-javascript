import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _graphqlIntegration = (() => {
  return {
    name: 'Graphql',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new GraphQLInstrumentation({
          ignoreTrivialResolveSpans: true,
          responseHook(span) {
            addOriginToSpan(span, 'auto.graphql.otel.graphql');
          },
        }),
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * GraphQL integration
 *
 * Capture tracing data for GraphQL.
 */
export const graphqlIntegration = defineIntegration(_graphqlIntegration);
