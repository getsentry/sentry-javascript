import type { Instrumentation } from '@opentelemetry/instrumentation';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import type { Integration } from '@sentry/types';

import { addOriginToOtelSpan } from '../utils/addOriginToSpan';
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
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Postgres.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new PgInstrumentation({
        requestHook(span) {
          addOriginToOtelSpan(span, 'auto.db.otel.postgres');
        },
      }),
    ];
  }
}
