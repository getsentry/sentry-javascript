/*
 * Copyright Prisma
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation
 * - Upstream version: @prisma/instrumentation@7.8.0
 * - Replaced `@prisma/instrumentation-contract` imports with local vendored types
 * - Span creation uses Sentry's span APIs (`startSpanManual` / `startInactiveSpan`) instead of the OTel tracer
 * - Span creation sets the Sentry origin, renames `db_query` spans to their SQL text, and backfills
 *   the db system for older Prisma versions
 * - Added a `createEngineSpan` method so a single helper serves both Prisma v5 (which calls
 *   `createEngineSpan`) and v6/v7 (which call `dispatchEngineSpans`)
 */

import type { Span, SpanAttributes } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  LRUMap,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  startSpanManual,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { EngineSpan, ExtendedSpanOptions, SpanCallback, TracingHelper } from './types';
import { DB_STATEMENT, DB_SYSTEM, DB_SYSTEM_NAME, SENTRY_KIND, SENTRY_OP } from '@sentry/conventions/attributes';

// Reading `process.env` can throw in runtimes that gate env access (e.g. Deno without `--allow-env`)
// and `process` may be absent altogether (edge runtimes), so this degrades to `false` in those cases.
const showAllTraces = ((): boolean => {
  try {
    return process.env.PRISMA_SHOW_ALL_TRACES === 'true';
  } catch {
    return false;
  }
})();

const nonSampledTraceParent = `00-10-10-00`;

const PRISMA_ORIGIN = 'auto.db.otel.prisma';

type Options = {
  ignoreSpanTypes: (string | RegExp)[];
};

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
 * Older Prisma versions emit `prisma:engine:db_query` spans without a db system, so it's backfilled here.
 */
function buildSpanAttributes(name: string, attributes: Record<string, unknown> | undefined): SpanAttributes {
  const merged: SpanAttributes = {
    ...(attributes as SpanAttributes | undefined),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: PRISMA_ORIGIN,
  };

  // Prisma itself emits the deprecated `db.system` on older versions, so both spellings are checked
  // before backfilling; the backfilled value goes on the stable one.
  // oxlint-disable-next-line typescript/no-deprecated
  if (name === 'prisma:engine:db_query' && merged[DB_SYSTEM] == null && merged[DB_SYSTEM_NAME] == null) {
    merged[DB_SYSTEM_NAME] = 'prisma';
  }

  // oxlint-disable-next-line typescript/no-deprecated
  if (merged[DB_SYSTEM] || merged[DB_SYSTEM_NAME]) {
    merged[SENTRY_OP] = 'db';
  }

  return merged;
}

/**
 * Db query spans are named after their SQL text (e.g. `SELECT * FROM "User"`) rather than the generic
 * engine name. v5/v6 emit `prisma:engine:db_query`; v7 inlined the engine and emits `prisma:client:db_query`.
 */
function buildSpanName(name: string, attributes: SpanAttributes): string {
  // oxlint-disable-next-line typescript/no-deprecated
  const dbStatement = attributes[DB_STATEMENT];
  if (typeof dbStatement === 'string' && dbStatement) {
    return dbStatement;
  }
  const queryText = attributes['db.query.text'];
  if ((name === 'prisma:engine:db_query' || name === 'prisma:client:db_query') && typeof queryText === 'string') {
    return queryText;
  }
  return name;
}

/**
 * Create every pending v5 engine span whose parent is now registered, repeating until no further span
 * resolves (so a child queued before its parent is created once the parent arrives in a later batch).
 * Each span is created under its resolved parent and registered by its engine id so its own children
 * can find it; origin, the `prisma:engine:db_query` to SQL rename, and the db system backfill are
 * applied here, exactly as for v6/v7 engine spans.
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

      const attributes = buildSpanAttributes(engineSpan.name, engineSpan.attributes);
      const span = startInactiveSpan({
        name: buildSpanName(engineSpan.name, attributes),
        attributes: {
          ...attributes,
          [SENTRY_KIND]: engineSpan.kind === 'client' ? 'client' : undefined,
        },
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

/**
 * This satisifes the TracingHelper interface for Prisma v5 and v6/v7.
 */
export class ActiveTracingHelper implements TracingHelper {
  private ignoreSpanTypes: (string | RegExp)[];

  public constructor({ ignoreSpanTypes }: Options) {
    this.ignoreSpanTypes = ignoreSpanTypes;
  }

  public isEnabled(): boolean {
    return true;
  }

  public getTraceParent(span?: Span): string {
    const spanContext = (span ?? getActiveSpan())?.spanContext();
    if (spanContext) {
      return `00-${spanContext.traceId}-${spanContext.spanId}-0${spanContext.traceFlags}`;
    }
    return nonSampledTraceParent;
  }

  public dispatchEngineSpans(spans: EngineSpan[]): void {
    const linkIds = new Map<string, string>();
    const roots = spans.filter(span => span.parentId === null);

    for (const root of roots) {
      dispatchEngineSpan(root, spans, linkIds, this.ignoreSpanTypes);
    }
  }

  /**
   * Prisma v5 broke the tracing helper interface with the v6 major, replacing `createEngineSpan` with
   * `dispatchEngineSpans`. We implement the v6/v7 interface (`dispatchEngineSpans`) but also keep this
   * v5-only method so the same helper doesn't blow up in Prisma 5 users' faces, minting v5 engine spans
   * through Sentry's span APIs instead of crashing.
   */
  public createEngineSpan(engineSpanEvent: V5EngineSpanEvent): void {
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
  }

  public getActiveContext(): Span | undefined {
    return getActiveSpan();
  }

  public runInChildSpan<R>(nameOrOptions: string | ExtendedSpanOptions, callback: SpanCallback<R>): R {
    const options: ExtendedSpanOptions = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;

    if (options.internal && !showAllTraces) {
      return callback();
    }

    const name = `prisma:client:${options.name}`;

    if (shouldIgnoreSpan(name, this.ignoreSpanTypes)) {
      return callback();
    }

    const parentSpan = getActiveSpan();

    const attributes = buildSpanAttributes(name, options.attributes);
    const spanOptions = {
      name: buildSpanName(name, attributes),
      attributes,
      kind: options.kind,
      links: options.links,
      startTime: options.startTime,
      parentSpan,
    };

    if (options.active === false) {
      const span = startInactiveSpan(spanOptions);
      // Register the client span so a v5 engine span (dispatched later, detached) can resolve it as a
      // parent by the Sentry span id Prisma reported via `getTraceParent` (see `createResolvedEngineSpans`).
      registerPrismaSpan(span.spanContext().spanId, span);
      return endSpan(span, () => callback(span, parentSpan));
    }

    return startSpanManual(spanOptions, span => {
      registerPrismaSpan(span.spanContext().spanId, span);
      return endSpan(span, () => callback(span, parentSpan));
    });
  }
}

function dispatchEngineSpan(
  engineSpan: EngineSpan,
  allSpans: EngineSpan[],
  linkIds: Map<string, string>,
  ignoreSpanTypes: (string | RegExp)[],
): void {
  if (shouldIgnoreSpan(engineSpan.name, ignoreSpanTypes)) {
    return;
  }

  const attributes = buildSpanAttributes(engineSpan.name, engineSpan.attributes);

  startSpanManual(
    {
      name: buildSpanName(engineSpan.name, attributes),
      attributes: {
        ...attributes,
        [SENTRY_KIND]: engineSpan.kind === 'client' ? 'client' : undefined,
      },
      startTime: engineSpan.startTime,
    },
    span => {
      linkIds.set(engineSpan.id, span.spanContext().spanId);

      if (engineSpan.links) {
        span.addLinks(
          engineSpan.links.flatMap(link => {
            const linkedId = linkIds.get(link);
            if (!linkedId) {
              return [];
            }
            return {
              context: {
                spanId: linkedId,
                traceId: span.spanContext().traceId,
                traceFlags: span.spanContext().traceFlags,
              },
            };
          }),
        );
      }

      const children = allSpans.filter(s => s.parentId === engineSpan.id);
      for (const child of children) {
        dispatchEngineSpan(child, allSpans, linkIds, ignoreSpanTypes);
      }

      span.end(engineSpan.endTime);
    },
  );
}

function endSpan<T>(span: Span, run: () => T): T {
  let result: T;
  try {
    result = run();
  } catch (reason) {
    span.end();
    throw reason;
  }

  if (isPromiseLike(result)) {
    return result.then(
      value => {
        span.end();
        return value;
      },
      reason => {
        span.end();
        throw reason;
      },
    ) as T;
  }
  span.end();
  return result;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as Record<string, unknown>)['then'] === 'function';
}

function shouldIgnoreSpan(spanName: string, ignoreSpanTypes: (string | RegExp)[]): boolean {
  return ignoreSpanTypes.some(pattern => (typeof pattern === 'string' ? pattern === spanName : pattern.test(spanName)));
}
