// The "@prisma/instrumentation" package is CJS, meaning we cannot use named exports, or the "import * as" syntax, otherwise we will break people on ESM, importing `prismaIntegration`.
import prismaInstrumentation from '@prisma/instrumentation';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

const _prismaIntegration = (() => {
  return {
    name: 'Prisma',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        // does not have a hook to adjust spans & add origin
        new prismaInstrumentation.PrismaInstrumentation({}),
      );
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
 * Note: This requieres to set:
 * previewFeatures = ["tracing"]
 * For the prisma client.
 * See https://www.prisma.io/docs/concepts/components/prisma-client/opentelemetry-tracing for more details.
 */
export const prismaIntegration = defineIntegration(_prismaIntegration);
