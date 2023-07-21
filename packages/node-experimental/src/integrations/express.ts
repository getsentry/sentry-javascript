import type { Instrumentation } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './lazy';

/**
 * Express integration
 *
 * Capture tracing data for express.
 */
export class Express extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Express';

  /**
   * @inheritDoc
   */
  public name: string = Express.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [new ExpressInstrumentation()];
  }
}
