import type { Link, Tracer } from '@opentelemetry/api';
import { context, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { IdGenerator } from '@opentelemetry/sdk-trace-base';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { consoleSandbox, defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, spanToJSON } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import type { PrismaV5TracingHelper } from './prisma/vendor/v5-tracing-helper';
import type { PrismaV6TracingHelper } from './prisma/vendor/v6-tracing-helper';

const INTEGRATION_NAME = 'Prisma';

type CompatibilityLayerTraceHelper = PrismaV5TracingHelper & PrismaV6TracingHelper;

// Vendored in from @prisma/instrumentation v5:
type V5EngineSpanEvent = {
  span: boolean;
  spans: V5EngineSpan[];
};

type V5EngineSpanKind = 'client' | 'internal';

type V5EngineSpan = {
  span: boolean;
  name: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  start_time: [number, number];
  end_time: [number, number];
  attributes?: Record<string, string>;
  links?: { trace_id: string; span_id: string }[];
  kind: V5EngineSpanKind;
};

function isPrismaV6TracingHelper(helper: unknown): helper is PrismaV6TracingHelper {
  return !!helper && typeof helper === 'object' && 'dispatchEngineSpans' in helper;
}

function getPrismaTracingHelper(): unknown | undefined {
  const prismaInstrumentationObject = (globalThis as Record<string, unknown>).PRISMA_INSTRUMENTATION;
  const prismaTracingHelper =
    prismaInstrumentationObject &&
    typeof prismaInstrumentationObject === 'object' &&
    'helper' in prismaInstrumentationObject
      ? prismaInstrumentationObject.helper
      : undefined;

  return prismaTracingHelper;
}

type TracerWithIdGenerator = Tracer & {
  _idGenerator?: IdGenerator;
};

interface PrismaOptions {
  /**
   * @deprecated This is no longer used, v5 works out of the box.
   */
  prismaInstrumentation?: Instrumentation;
  /**
   * Configuration passed through to the {@link PrismaInstrumentation} constructor.
   */
  instrumentationConfig?: ConstructorParameters<typeof PrismaInstrumentation>[0];
}

class SentryPrismaInteropInstrumentation extends PrismaInstrumentation {
  public constructor(options?: PrismaOptions) {
    super(options?.instrumentationConfig);
  }

  public enable(): void {
    super.enable();

    // The PrismaIntegration (super class) defines a global variable `global["PRISMA_INSTRUMENTATION"]` when `enable()` is called. This global variable holds a "TracingHelper" which Prisma uses internally to create tracing data. It's their way of not depending on OTEL with their main package. The sucky thing is, prisma broke the interface of the tracing helper with the v6 major update. This means that if you use Prisma 5 with the v6 instrumentation (or vice versa) Prisma just blows up, because tries to call methods on the helper that no longer exist.
    // Because we actually want to use the v6 instrumentation and not blow up in Prisma 5 user's faces, what we're doing here is backfilling the v5 method (`createEngineSpan`) with a noop so that no longer crashes when it attempts to call that function.
    const prismaTracingHelper = getPrismaTracingHelper();

    if (isPrismaV6TracingHelper(prismaTracingHelper)) {
      // Inspired & adjusted from https://github.com/prisma/prisma/tree/5.22.0/packages/instrumentation
      (prismaTracingHelper as CompatibilityLayerTraceHelper).createEngineSpan = (
        engineSpanEvent: V5EngineSpanEvent,
      ) => {
        const tracer = trace.getTracer('prismaV5Compatibility') as TracerWithIdGenerator;

        // Prisma v5 relies on being able to create spans with a specific span & trace ID
        // this is no longer possible in OTEL v2, there is no public API to do this anymore
        // So in order to kind of hack this possibility, we rely on the internal `_idGenerator` property
        // This is used to generate the random IDs, and we overwrite this temporarily to generate static IDs
        // This is flawed and may not work, e.g. if the code is bundled and the private property is renamed
        // in such cases, these spans will not be captured and some Prisma spans will be missing
        const initialIdGenerator = tracer._idGenerator;

        if (!initialIdGenerator) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] Could not find _idGenerator on tracer, skipping Prisma v5 compatibility - some Prisma spans may be missing!',
            );
          });

          return;
        }

        try {
          engineSpanEvent.spans.forEach(engineSpan => {
            const kind = engineSpanKindToOTELSpanKind(engineSpan.kind);

            const parentSpanId = engineSpan.parent_span_id;
            const spanId = engineSpan.span_id;
            const traceId = engineSpan.trace_id;

            const links: Link[] | undefined = engineSpan.links?.map(link => {
              return {
                context: {
                  traceId: link.trace_id,
                  spanId: link.span_id,
                  traceFlags: TraceFlags.SAMPLED,
                },
              };
            });

            const ctx = trace.setSpanContext(context.active(), {
              traceId,
              spanId: parentSpanId,
              traceFlags: TraceFlags.SAMPLED,
            });

            context.with(ctx, () => {
              const temporaryIdGenerator: IdGenerator = {
                generateTraceId: () => {
                  return traceId;
                },
                generateSpanId: () => {
                  return spanId;
                },
              };

              tracer._idGenerator = temporaryIdGenerator;

              const span = tracer.startSpan(engineSpan.name, {
                kind,
                links,
                startTime: engineSpan.start_time,
                attributes: engineSpan.attributes,
              });

              span.end(engineSpan.end_time);

              tracer._idGenerator = initialIdGenerator;
            });
          });
        } finally {
          // Ensure we always restore this at the end, even if something errors
          tracer._idGenerator = initialIdGenerator;
        }
      };
    }
  }
}

function engineSpanKindToOTELSpanKind(engineSpanKind: V5EngineSpanKind): SpanKind {
  switch (engineSpanKind) {
    case 'client':
      return SpanKind.CLIENT;
    case 'internal':
    default: // Other span kinds aren't currently supported
      return SpanKind.INTERNAL;
  }
}

export const instrumentPrisma = generateInstrumentOnce<PrismaOptions>(INTEGRATION_NAME, options => {
  return new SentryPrismaInteropInstrumentation(options);
});

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
export const prismaIntegration = defineIntegration((options?: PrismaOptions) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPrisma(options);
    },
    setup(client) {
      // If no tracing helper exists, we skip any work here
      // this means that prisma is not being used
      if (!getPrismaTracingHelper()) {
        return;
      }

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
});
