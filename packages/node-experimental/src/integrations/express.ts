import type { Instrumentation } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { addOtelSpanData } from '@sentry/opentelemetry-node';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

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
  public name: string;

  public constructor() {
    super();
    this.name = Express.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new ExpressInstrumentation({
        requestHook(span) {
          addOtelSpanData(span.spanContext().spanId, {
            origin: 'auto.http.otel-express',
          });
        },
      }),
    ];
  }
}
