import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * MySQL integration
 *
 * Capture tracing data for mysql.
 */
export class Mysql extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mysql';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Mysql.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Has no hook to adjust spans and add origin
    return [new MySQLInstrumentation({})];
  }
}
