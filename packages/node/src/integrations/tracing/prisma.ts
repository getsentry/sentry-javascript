import type { Instrumentation } from '@opentelemetry/instrumentation';
// When importing CJS modules into an ESM module, we cannot import the named exports directly.
import * as prismaInstrumentation from '@prisma/instrumentation';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, consoleSandbox, defineIntegration, spanToJSON } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';
import type { PrismaV5TracingHelper } from './prisma/vendor/v5-tracing-helper';
import type { PrismaV6TracingHelper } from './prisma/vendor/v6-tracing-helper';

const INTEGRATION_NAME = 'Prisma';

const EsmInteropPrismaInstrumentation: typeof prismaInstrumentation.PrismaInstrumentation =
  // @ts-expect-error We need to do the following for interop reasons
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  prismaInstrumentation.default?.PrismaInstrumentation || prismaInstrumentation.PrismaInstrumentation;

type CompatibilityLayerTraceHelper = PrismaV5TracingHelper & PrismaV6TracingHelper;

function isPrismaV5TracingHelper(helper: unknown): helper is PrismaV5TracingHelper {
  return !!helper && typeof helper === 'object' && 'createEngineSpan' in helper;
}

class SentryPrismaInteropInstrumentation extends EsmInteropPrismaInstrumentation {
  public constructor() {
    super();
  }

  public enable(): void {
    super.enable();

    // The PrismaIntegration (super class) defines a global variable `global["PRISMA_INSTRUMENTATION"]` when `enable()` is called. This global variable holds a "TracingHelper" which Prisma uses internally to create tracing data. It's their way of not depending on OTEL with their main package. The sucky thing is, prisma broke the interface of the tracing helper with the v6 major update. This means that if you use Prisma 6 with the v5 instrumentation (or vice versa) Prisma just blows up, because tries to call methods on the helper that no longer exist.
    // Because we actually want to use the v6 instrumentation and not blow up in Prisma 5 user's faces, what we're doing here is backfilling the v5 method (`createEngineSpan`) with a noop so that no longer crashes when it attempts to call that function.
    // We still won't fully emit all the spans, but this could potentially be implemented in the future.
    const prismaInstrumentationObject = (globalThis as Record<string, unknown>).PRISMA_INSTRUMENTATION;
    const prismaTracingHelper =
      prismaInstrumentationObject &&
      typeof prismaInstrumentationObject === 'object' &&
      'helper' in prismaInstrumentationObject
        ? prismaInstrumentationObject.helper
        : undefined;

    let emittedWarning = false;

    if (isPrismaV5TracingHelper(prismaTracingHelper)) {
      (prismaTracingHelper as CompatibilityLayerTraceHelper).dispatchEngineSpans = () => {
        consoleSandbox(() => {
          if (!emittedWarning) {
            emittedWarning = true;
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] This version (v8) of the Sentry SDK does not support tracing with Prisma version 6 out of the box. To trace Prisma version 6, pass a `prismaInstrumentation` for version 6 to the Sentry `prismaIntegration`. Read more: https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/',
            );
          }
        });
      };
    }
  }
}

export const instrumentPrisma = generateInstrumentOnce<{ prismaInstrumentation?: Instrumentation }>(
  INTEGRATION_NAME,
  options => {
    // Use a passed instrumentation instance to support older Prisma versions
    if (options?.prismaInstrumentation) {
      return options.prismaInstrumentation;
    }

    return new SentryPrismaInteropInstrumentation();
  },
);

/**
 * Adds Sentry tracing instrumentation for the [Prisma](https://www.npmjs.com/package/prisma) ORM.
 * For more information, see the [`prismaIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/).
 *
 * Make sure `previewFeatures = ["tracing"]` is added to the generator block in your Prisma schema.
 *
 * ```prisma
 * generator client {
 *  provider = "prisma-client-js"
 *  previewFeatures = ["tracing"]
 * }
 * ```
 *
 * NOTE: By default, this integration works with Prisma version 5.
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
 */
export const prismaIntegration = defineIntegration(
  ({
    prismaInstrumentation,
  }: {
    /**
     * Overrides the instrumentation used by the Sentry SDK with the passed in instrumentation instance.
     *
     * NOTE: By default, the Sentry SDK uses the Prisma v5 instrumentation. Use this option if you need performance instrumentation different Prisma versions.
     *
     * For more information refer to the documentation of `prismaIntegration()` or see https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/
     */
    prismaInstrumentation?: Instrumentation;
  } = {}) => {
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
          if (spanJSON.description === 'prisma:engine:db_query' && spanJSON.data?.['db.query.text']) {
            span.updateName(spanJSON.data['db.query.text'] as string);
          }

          // In Prisma v5.22+, the `db.system` attribute is automatically set
          // On older versions, this is missing, so we add it here
          if (spanJSON.description === 'prisma:engine:db_query' && !spanJSON.data?.['db.system']) {
            span.setAttribute('db.system', 'prisma');
          }
        });
      },
    };
  },
);
