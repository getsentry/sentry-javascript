import type { Instrumentation } from '@opentelemetry/instrumentation';
// When importing CJS modules into an ESM module, we cannot import the named exports directly.
import * as prismaInstrumentation from '@prisma/instrumentation';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'Prisma';

export const instrumentPrisma = generateInstrumentOnce<{ prismaInstrumentation?: Instrumentation }>(
  INTEGRATION_NAME,
  options => {
    // Use a passed instrumentation instance to support older Prisma versions
    if (options?.prismaInstrumentation) {
      return options.prismaInstrumentation;
    }

    const EsmInteropPrismaInstrumentation: typeof prismaInstrumentation.PrismaInstrumentation =
      // @ts-expect-error We need to do the following for interop reasons
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      prismaInstrumentation.default?.PrismaInstrumentation || prismaInstrumentation.PrismaInstrumentation;

    return new EsmInteropPrismaInstrumentation({});
  },
);

/**
 * Adds Sentry tracing instrumentation for the [prisma](https://www.npmjs.com/package/prisma) library.
 * For more information, see the [`prismaIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/).
 *
 * NOTE: By default, this integration works with Prisma version 6.
 * To get performance instrumentation for other Prisma versions,
 * 1. Install the `@prisma/instrumentation` package with the desired version.
 * 1. Pass a `new PrismaInstrumentation()` instance as exported from `@prisma/instrumentation` to the `prismaInstrumentation` option of this integration:
 *
 *    ```js
 *    import { PrismaInstrumentation } from '@prisma/instrumentation'
 *
 *    Sentry.init({
 *      integrations: [
 *        prismaIntegration({
 *          // Override the default instrumentation that Sentry uses
 *          prismaInstrumentation: new PrismaInstrumentation()
 *        })
 *      ]
 *    })
 *    ```
 *
 *    The passed instrumentation instance will override the default instrumentation instance the integration would use, while the `prismaIntegration` will still ensure data compatibility for the various Prisma versions.
 * 1. Depending on your Prisma version (prior to version 6), add `previewFeatures = ["tracing"]` to the client generator block of your Prisma schema:
 *
 *    ```
 *    generator client {
 *      provider = "prisma-client-js"
 *      previewFeatures = ["tracing"]
 *    }
 *    ```
 */
export const prismaIntegration = defineIntegration(
  ({
    prismaInstrumentation,
  }: {
    /**
     * Overrides the instrumentation used by the Sentry SDK with the passed in instrumentation instance.
     *
     * NOTE: By default, the Sentry SDK uses the Prisma v6 instrumentation. Use this option if you need performance instrumentation different Prisma versions.
     *
     * For more information refer to the documentation of `prismaIntegration()` or see https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/
     */
    prismaInstrumentation?: Instrumentation;
  }) => {
    return {
      name: INTEGRATION_NAME,
      setupOnce() {
        instrumentPrisma({ prismaInstrumentation });
      },
      setup(client) {
        client.on('spanStart', span => {
          const spanJSON = spanToJSON(span);
          if (spanJSON.description?.startsWith('prisma:')) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.prisma');
          }

          // Make sure we use the query text as the span name, for ex. SELECT * FROM "User" WHERE "id" = $1
          if (spanJSON.description === 'prisma:engine:db_query' && spanJSON.data['db.query.text']) {
            span.updateName(spanJSON.data['db.query.text'] as string);
          }

          // In Prisma v5.22+, the `db.system` attribute is automatically set
          // On older versions, this is missing, so we add it here
          if (spanJSON.description === 'prisma:engine:db_query' && !spanJSON.data['db.system']) {
            span.setAttribute('db.system', 'prisma');
          }
        });
      },
    };
  },
);
