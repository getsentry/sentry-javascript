import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _mysql2Integration = (() => {
  return {
    name: 'Mysql2',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new MySQL2Instrumentation({
            responseHook(span) {
              addOriginToSpan(span, 'auto.db.otel.mysql2');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const mysql2Integration = defineIntegration(_mysql2Integration);

/**
 * MySQL2 integration
 *
 * Capture tracing data for mysql2
 *
 * @deprecated Use `mysql2Integration()` instead.
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
    // eslint-disable-next-line deprecation/deprecation
    this.name = Mysql2.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new MySQL2Instrumentation({
        responseHook(span) {
          addOriginToSpan(span, 'auto.db.otel.mysql2');
        },
      }),
    ];
  }
}
