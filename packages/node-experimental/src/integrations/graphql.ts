import type { Instrumentation } from '@opentelemetry/instrumentation';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * GraphQL integration
 *
 * Capture tracing data for GraphQL.
 */
export class GraphQL extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GraphQL';

  /**
   * @inheritDoc
   */
  public name: string = GraphQL.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new GraphQLInstrumentation({
        ignoreTrivialResolveSpans: true,
      }),
    ];
  }
}
