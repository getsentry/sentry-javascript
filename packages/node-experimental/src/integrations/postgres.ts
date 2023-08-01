import type { Instrumentation } from '@opentelemetry/instrumentation';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * Postgres integration
 *
 * Capture tracing data for pg.
 */
export class Postgres extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Postgres';

  /**
   * @inheritDoc`
   */
  public name: string = Postgres.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [new PgInstrumentation({})];
  }
}
