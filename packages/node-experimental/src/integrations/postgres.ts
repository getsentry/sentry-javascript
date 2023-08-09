import type { Instrumentation } from '@opentelemetry/instrumentation';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { addOtelSpanData } from '@sentry/opentelemetry-node';
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
          addOtelSpanData(span.spanContext().spanId, {
            origin: 'auto.db.otel-postgres',
          });
        },
      }),
    ];
  }
}
