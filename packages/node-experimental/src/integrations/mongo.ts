import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import type { Integration } from '@sentry/types';

import { addOriginToSpan } from '../utils/addOriginToSpan';
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
  public static id = 'Mongo';

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
          addOriginToSpan(span, 'auto.db.otel.mongo');
        },
      }),
    ];
  }
}
