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
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Nest.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Does not have a hook to adjust spans and add origin
    return [new NestInstrumentation({})];
  }
}
