import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  LRUMap,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../../debug-build';
import { PrismaInstrumentation } from './vendored/instrumentation';
import type { PrismaV5TracingHelper } from './vendored/v5-tracing-helper';
import type { PrismaV6TracingHelper } from './vendored/v6-tracing-helper';

const INTEGRATION_NAME = 'Prisma' as const;

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

// Prisma v5 dispatches engine spans (`prisma:engine:*`, which carry the SQL `db.statement`) one batch
// at a time, out of order, and detached from the active span, naming their parent only by id: a span
// references either a client span (by the Sentry span id Prisma learned via `getTraceParent`) or a
// sibling engine span (by the engine's own id), and a batch may not contain the parent it references.
// By the time the engine reports them the client span may already have ended, so `getActiveSpan()`
// can't be used to find it. `prismaSpanRegistry` maps span ids to their Sentry span, and an engine
// span whose parent isn't registered yet waits in `pendingEngineSpans` until a later batch registers it.
const MAX_TRACKED_PRISMA_SPANS = 1000;
const prismaSpanRegistry = new LRUMap<string, Span>(MAX_TRACKED_PRISMA_SPANS);
const pendingEngineSpans: V5EngineSpan[] = [];

/** Register a span so v5 engine spans can later resolve it as a parent by the id Prisma reports it under. */
function registerPrismaSpan(id: string, span: Span): void {
  prismaSpanRegistry.set(id, span);
}

/**
 * Create every pending v5 engine span whose parent is now registered, repeating until no further span
 * resolves (so a child queued before its parent is created once the parent arrives in a later batch).
 * Each span is created under its resolved parent and registered by its engine id so its own children
 * can find it; origin, the `prisma:engine:db_query` to SQL rename, and the `db.system` backfill are
 * applied by the `spanStart` hook, exactly as for v6/v7 engine spans.
 */
function createResolvedEngineSpans(): void {
  // Terminates: `createdSpan` is only set true right after a `splice`, so every pass that keeps the
  // loop going strictly shrinks the finite `pendingEngineSpans`; a pass that resolves nothing exits.
  let createdSpan = true;
  while (createdSpan) {
    createdSpan = false;
    for (let i = pendingEngineSpans.length - 1; i >= 0; i--) {
      const engineSpan = pendingEngineSpans[i]!;
      const parentSpan = prismaSpanRegistry.get(engineSpan.parent_span_id);
      if (!parentSpan) {
        continue;
      }

      const span = startInactiveSpan({
        name: engineSpan.name,
        attributes: engineSpan.attributes,
        kind: engineSpan.kind === 'client' ? SPAN_KIND.CLIENT : SPAN_KIND.INTERNAL,
        startTime: engineSpan.start_time,
        parentSpan,
      });
      registerPrismaSpan(engineSpan.span_id, span);

      // Engine links reference other engine spans by their engine id; re-point them at the Sentry spans
      // we minted (mirroring v6/v7's `dispatchEngineSpan`). Links must be added before the span ends,
      // since the SentryTracerProvider seals spans on end. Links to spans we haven't created are dropped.
      if (engineSpan.links) {
        span.addLinks(
          engineSpan.links.flatMap(link => {
            const linkedSpan = prismaSpanRegistry.get(link.span_id);
            return linkedSpan ? [{ context: linkedSpan.spanContext() }] : [];
          }),
        );
      }

      span.end(engineSpan.end_time);

      pendingEngineSpans.splice(i, 1);
      createdSpan = true;
    }
  }
}

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
    // Because we actually want to use the v6/v7 instrumentation and not blow up in Prisma 5 users' faces, we backfill the v5-only `createEngineSpan` method so v5 engine spans are minted through Sentry's span APIs instead of crashing.
    const prismaTracingHelper = getPrismaTracingHelper();

    if (isPrismaV6TracingHelper(prismaTracingHelper)) {
      (prismaTracingHelper as CompatibilityLayerTraceHelper).createEngineSpan = (
        engineSpanEvent: V5EngineSpanEvent,
      ) => {
        pendingEngineSpans.push(...engineSpanEvent.spans);

        // Resolve before capping so a span is only ever dropped after a full resolution attempt, never
        // before it had a chance to find its parent. What remains are orphans whose parent was never
        // registered (e.g. evicted from the registry under sustained load); cap that backlog so it can't
        // grow without bound.
        createResolvedEngineSpans();

        const overflow = pendingEngineSpans.length - MAX_TRACKED_PRISMA_SPANS;
        if (overflow > 0) {
          DEBUG_BUILD &&
            debug.log(`[Prisma] Dropping ${overflow} unresolved v5 engine span(s) whose parent was never registered.`);
          pendingEngineSpans.splice(0, overflow);
        }
      };
    }
  }
}

export const instrumentPrisma = generateInstrumentOnce<PrismaOptions>(INTEGRATION_NAME, options => {
  return new SentryPrismaInteropInstrumentation(options);
});

/**
 * Adds Sentry tracing instrumentation for the [prisma](https://www.npmjs.com/package/prisma) library.
 * For more information, see the [`prismaIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/).
 *
 * NOTE: This integration works out of the box with Prisma v6, and v7.
 * On Prisma versions prior to v6, add `previewFeatures = ["tracing"]` to the client generator block of your Prisma schema:
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

      // Prisma v5 engine spans are created via the `createEngineSpan` path above, which bypasses the
      // tracing helper, so this hook applies origin, the db_query rename, and the db.system backfill to
      // them. v6/v7 spans already get these from the helper; the guards are idempotent, so it's a no-op there.
      client.on('spanStart', span => {
        const spanJSON = spanToJSON(span);
        if (spanJSON.description?.startsWith('prisma:')) {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.prisma');
          // Register the span so v5 engine spans (dispatched later, detached) can resolve it as a
          // parent by the id Prisma reported it under (see `createResolvedEngineSpans`).
          registerPrismaSpan(span.spanContext().spanId, span);
        }

        // Make sure we use the query text as the span name, for ex. SELECT * FROM "User" WHERE "id" = $1.
        // v5/v6 emit `prisma:engine:db_query`; v7 inlined the engine and emits `prisma:client:db_query`.
        if (
          (spanJSON.description === 'prisma:engine:db_query' || spanJSON.description === 'prisma:client:db_query') &&
          spanJSON.data['db.query.text']
        ) {
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
