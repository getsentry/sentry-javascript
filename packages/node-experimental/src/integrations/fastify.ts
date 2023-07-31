import type { Instrumentation } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './lazy';

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
  public name: string = Fastify.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [new FastifyInstrumentation()];
  }
}
