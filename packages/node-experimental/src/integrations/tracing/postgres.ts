import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _postgresIntegration = (() => {
  return {
    name: 'Postgres',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new PgInstrumentation({
            requireParentSpan: true,
            requestHook(span) {
              addOriginToSpan(span, 'auto.db.otel.postgres');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const postgresIntegration = defineIntegration(_postgresIntegration);

/**
 * Postgres integration
 *
 * Capture tracing data for pg.
 *
 * @deprecated Use `postgresIntegration()` instead.
 */
export class Postgres extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Postgres';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = Postgres.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new PgInstrumentation({
        requireParentSpan: true,
        requestHook(span) {
          addOriginToSpan(span, 'auto.db.otel.postgres');
        },
      }),
    ];
  }
}
