// When importing CJS modules into an ESM module, we cannot import the named exports directly.
import * as prismaInstrumentation from '@prisma/instrumentation';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'Prisma';

export const instrumentPrisma = generateInstrumentOnce(INTEGRATION_NAME, () => {
  const EsmInteropPrismaInstrumentation: typeof prismaInstrumentation.PrismaInstrumentation =
    // @ts-expect-error We need to do the following for interop reasons
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    prismaInstrumentation.default?.PrismaInstrumentation || prismaInstrumentation.PrismaInstrumentation;

  return new EsmInteropPrismaInstrumentation({});
});

const _prismaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPrisma();
    },

    setup(client) {
      client.on('spanStart', span => {
        const spanJSON = spanToJSON(span);
        if (spanJSON.description?.startsWith('prisma:')) {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.prisma');
        }

        if (spanJSON.description === 'prisma:engine:db_query') {
          span.setAttribute('db.system', 'prisma');
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Prisma integration
 *
 * Capture tracing data for prisma.
 * Note: This requires to set:
 * previewFeatures = ["tracing"]
 * For the prisma client.
 * See https://www.prisma.io/docs/concepts/components/prisma-client/opentelemetry-tracing for more details.
 */
export const prismaIntegration = defineIntegration(_prismaIntegration);
