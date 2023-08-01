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
   * @inheritDoc`
   */
  public name: string = Mysql.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [new MySQLInstrumentation({})];
  }
}
