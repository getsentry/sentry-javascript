import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _mongooseIntegration = (() => {
  return {
    name: 'Mongoose',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new MongooseInstrumentation({
            responseHook(span) {
              addOriginToSpan(span, 'auto.db.otel.mongoose');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const mongooseIntegration = defineIntegration(_mongooseIntegration);

/**
 * Mongoose integration
 *
 * Capture tracing data for Mongoose.
 *
 * @deprecated Use `mongooseIntegration()` instead.
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
    // eslint-disable-next-line deprecation/deprecation
    this.name = Mongoose.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new MongooseInstrumentation({
        responseHook(span) {
          addOriginToSpan(span, 'auto.db.otel.mongoose');
        },
      }),
    ];
  }
}
