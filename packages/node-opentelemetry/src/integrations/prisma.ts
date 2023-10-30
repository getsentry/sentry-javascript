import type { Instrumentation } from '@opentelemetry/instrumentation';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import type { Integration } from '@sentry/types';

import { NodePerformanceIntegration } from './NodePerformanceIntegration';

/**
 * Prisma integration
 *
 * Capture tracing data for prisma.
 * Note: This requieres to set:
 * previewFeatures = ["tracing"]
 * For the prisma client.
 * See https://www.prisma.io/docs/concepts/components/prisma-client/opentelemetry-tracing for more details.
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
    this.name = Prisma.id;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // does not have a hook to adjust spans & add origin
    return [new PrismaInstrumentation({})];
  }
}
