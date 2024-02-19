import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const _prismaIntegration = (() => {
  return {
    name: 'Prisma',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          // does not have a hook to adjust spans & add origin
          new PrismaInstrumentation({}),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

export const prismaIntegration = defineIntegration(_prismaIntegration);

/**
 * Prisma integration
 *
 * Capture tracing data for prisma.
 * Note: This requieres to set:
 * previewFeatures = ["tracing"]
 * For the prisma client.
 * See https://www.prisma.io/docs/concepts/components/prisma-client/opentelemetry-tracing for more details.
 *
 * @deprecated Use `prismaIntegration()` instead.
 */
export class Prisma extends NodePerformanceIntegration<void> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Prisma';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    super();
    // eslint-disable-next-line deprecation/deprecation
    this.name = Prisma.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // does not have a hook to adjust spans & add origin
    return [new PrismaInstrumentation({})];
  }
}
