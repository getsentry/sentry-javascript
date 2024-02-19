import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _nestIntegration = (() => {
  return {
    name: 'Nest',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new NestInstrumentation({})],
      });
    },
  };
}) satisfies IntegrationFn;

export const nestIntegration = defineIntegration(_nestIntegration);

/**
 * Nest framework integration
 *
 * Capture tracing data for nest.
 *
 * @deprecated Use `nestIntegration()` instead.
 */
export class Nest extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Nest';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = Nest.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Does not have a hook to adjust spans and add origin
    return [new NestInstrumentation({})];
  }
}
