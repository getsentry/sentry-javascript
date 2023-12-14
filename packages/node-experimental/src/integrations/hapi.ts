import type { Instrumentation } from '@opentelemetry/instrumentation';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * Hapi integration
 *
 * Capture tracing data for Hapi.
 */
export class Hapi extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'Hapi';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Hapi.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Has no hook to adjust spans and add origin
    return [new HapiInstrumentation()];
  }
}
