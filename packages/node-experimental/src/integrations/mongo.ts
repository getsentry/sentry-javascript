import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './lazy';

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
  public name: string = Mongo.id;

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [new MongoDBInstrumentation({})];
  }
}
