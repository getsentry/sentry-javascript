import type { Instrumentation } from '@opentelemetry/instrumentation';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * Nest framework integration
 *
 * Capture tracing data for nest.
 */
export class Nest extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Nest';

  /**
   * @inheritDoc`
   */
  public name: string = Nest.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [new NestInstrumentation({})];
  }
}
