import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _graphqlIntegration = (() => {
  return {
    name: 'Graphql',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new GraphQLInstrumentation({
            ignoreTrivialResolveSpans: true,
            responseHook(span) {
              addOriginToSpan(span, 'auto.graphql.otel.graphql');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * GraphQL integration
 *
 * Capture tracing data for GraphQL.
 */
export const graphqlIntegration = defineIntegration(_graphqlIntegration);
