import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { addOtelSpanData } from '@sentry/opentelemetry-node';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * MongoDB integration
 *
 * Capture tracing data for MongoDB.
 */
export class Mongo extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mongo';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Mongo.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new MongoDBInstrumentation({
        responseHook(span) {
          addOtelSpanData(span.spanContext().spanId, {
            origin: 'auto.db.otel-mongo',
          });
        },
      }),
    ];
  }
}
