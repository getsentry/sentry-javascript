import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _expressIntegration = (() => {
  return {
    name: 'Express',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new ExpressInstrumentation({
            requestHook(span) {
              addOriginToSpan(span, 'auto.http.otel.express');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const expressIntegration = defineIntegration(_expressIntegration);

/**
 * Express integration
 *
 * Capture tracing data for express.
 * @deprecated Use `expressIntegration()` instead.
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
    // eslint-disable-next-line deprecation/deprecation
    this.name = Express.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new ExpressInstrumentation({
        requestHook(span) {
          addOriginToSpan(span, 'auto.http.otel.express');
        },
      }),
    ];
  }
}
