import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

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

export const graphqlIntegration = defineIntegration(_graphqlIntegration);

/**
 * GraphQL integration
 *
 * Capture tracing data for GraphQL.
 *
 * @deprecated Use `graphqlIntegration()` instead.
 */
export class GraphQL extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GraphQL';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = GraphQL.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new GraphQLInstrumentation({
        ignoreTrivialResolveSpans: true,
        responseHook(span) {
          addOriginToSpan(span, 'auto.graphql.otel.graphql');
        },
      }),
    ];
  }
}
