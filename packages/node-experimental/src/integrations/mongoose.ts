import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import type { Integration } from '@sentry/types';

import { addOriginToOtelSpan } from '../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * Mongoose integration
 *
 * Capture tracing data for Mongoose.
 */
export class Mongoose extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mongoose';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    this.name = Mongoose.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new MongooseInstrumentation({
        responseHook(span) {
          addOriginToOtelSpan(span, 'auto.db.otel.mongoose');
        },
      }),
    ];
  }
}
