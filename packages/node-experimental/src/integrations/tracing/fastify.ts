import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _fastifyIntegration = (() => {
  return {
    name: 'Fastify',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new FastifyInstrumentation({
            requestHook(span) {
              addOriginToSpan(span, 'auto.http.otel.fastify');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const fastifyIntegration = defineIntegration(_fastifyIntegration);

/**
 * Express integration
 *
 * Capture tracing data for fastify.
 *
 * @deprecated Use `fastifyIntegration()` instead.
 */
export class Fastify extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Fastify';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = Fastify.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    return [
      new FastifyInstrumentation({
        requestHook(span) {
          addOriginToSpan(span, 'auto.http.otel.fastify');
        },
      }),
    ];
  }
}
