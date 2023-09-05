import type { Instrumentation } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import type { Integration } from '@sentry/types';

import { addOriginToOtelSpan } from '../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * Express integration
 *
 * Capture tracing data for fastify.
 */
export class Fastify extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Fastify';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Fastify.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new FastifyInstrumentation({
        requestHook(span) {
          addOriginToOtelSpan(span, 'auto.http.otel.fastify');
        },
      }),
    ];
  }
}
