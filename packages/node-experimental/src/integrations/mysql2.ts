import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { addOtelSpanData } from '@sentry/opentelemetry-node';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * MySQL2 integration
 *
 * Capture tracing data for mysql2
 */
export class Mysql2 extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mysql2';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Mysql2.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new MySQL2Instrumentation({
        responseHook(span) {
          addOtelSpanData(span.spanContext().spanId, {
            origin: 'auto.db.otel-mysql2',
          });
        },
      }),
    ];
  }
}
