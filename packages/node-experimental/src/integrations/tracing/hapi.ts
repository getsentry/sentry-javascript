import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _hapiIntegration = (() => {
  return {
    name: 'Hapi',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new HapiInstrumentation()],
      });
    },
  };
}) satisfies IntegrationFn;

export const hapiIntegration = defineIntegration(_hapiIntegration);

/**
 * Hapi integration
 *
 * Capture tracing data for Hapi.
 *
 * @deprecated Use `hapiIntegration()` instead.
 */
export class Hapi extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Hapi';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = Hapi.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Has no hook to adjust spans and add origin
    return [new HapiInstrumentation()];
  }
}
