import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _mysqlIntegration = (() => {
  return {
    name: 'Mysql',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new MySQLInstrumentation({})],
      });
    },
  };
}) satisfies IntegrationFn;

export const mysqlIntegration = defineIntegration(_mysqlIntegration);

/**
 * MySQL integration
 *
 * Capture tracing data for mysql.
 *
 * @deprecated Use `mysqlIntegration()` instead.
 */
export class Mysql extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mysql';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = Mysql.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Has no hook to adjust spans and add origin
    return [new MySQLInstrumentation({})];
  }
}
