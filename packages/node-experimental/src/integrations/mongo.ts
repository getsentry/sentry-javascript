import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _mongoIntegration = (() => {
  return {
    name: 'Mongo',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new MongoDBInstrumentation({
            responseHook(span) {
              addOriginToSpan(span, 'auto.db.otel.mongo');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const mongoIntegration = defineIntegration(_mongoIntegration);

/**
 * MongoDB integration
 *
 * Capture tracing data for MongoDB.
 *
 * @deprecated Use `mongoIntegration()` instead.
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
    // eslint-disable-next-line deprecation/deprecation
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
