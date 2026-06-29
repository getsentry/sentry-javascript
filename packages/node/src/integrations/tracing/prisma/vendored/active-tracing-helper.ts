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
 *   `db.system` for older Prisma versions
 */

import type { Context } from '@opentelemetry/api';
import { context as _context, trace } from '@opentelemetry/api';
import type { Span, SpanAttributes, SpanKindValue, SpanLink } from '@sentry/core';
import {
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  startInactiveSpan,
  startSpanManual,
} from '@sentry/core';
import type { EngineSpan, ExtendedSpanOptions, SpanCallback, TracingHelper } from './types';

const showAllTraces = process.env.PRISMA_SHOW_ALL_TRACES === 'true';

const nonSampledTraceParent = `00-10-10-00`;

const PRISMA_ORIGIN = 'auto.db.otel.prisma';

type Options = {
  ignoreSpanTypes: (string | RegExp)[];
};

/**
 * Older Prisma versions emit `prisma:engine:db_query` spans without a `db.system`, so it's backfilled here.
 */
function buildSpanAttributes(name: string, attributes: Record<string, unknown> | undefined): SpanAttributes {
  const merged: SpanAttributes = {
    ...(attributes as SpanAttributes | undefined),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: PRISMA_ORIGIN,
  };

  if (name === 'prisma:engine:db_query' && merged['db.system'] == null) {
    merged['db.system'] = 'prisma';
  }

  return merged;
}

/**
 * Db query spans are named after their SQL text (e.g. `SELECT * FROM "User"`) rather than the generic
 * engine name. v5/v6 emit `prisma:engine:db_query`; v7 inlined the engine and emits `prisma:client:db_query`.
 */
function buildSpanName(name: string, attributes: SpanAttributes): string {
  const queryText = attributes['db.query.text'];
  if ((name === 'prisma:engine:db_query' || name === 'prisma:client:db_query') && typeof queryText === 'string') {
    return queryText;
  }
  return name;
}

export class ActiveTracingHelper implements TracingHelper {
  private ignoreSpanTypes: (string | RegExp)[];

  public constructor({ ignoreSpanTypes }: Options) {
    this.ignoreSpanTypes = ignoreSpanTypes;
  }

  public isEnabled(): boolean {
    return true;
  }

  public getTraceParent(context?: Context): string {
    const spanContext = context ? trace.getSpanContext(context) : getActiveSpan()?.spanContext();
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

  public getActiveContext(): Context | undefined {
    return _context.active();
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

    const context = options.context ?? _context.active();

    const attributes = buildSpanAttributes(name, options.attributes as Record<string, unknown> | undefined);
    const spanOptions = {
      name: buildSpanName(name, attributes),
      attributes,
      kind: options.kind as SpanKindValue | undefined,
      links: options.links as SpanLink[] | undefined,
      startTime: options.startTime,
    };

    if (options.active === false) {
      const span = _context.with(context, () => startInactiveSpan(spanOptions));
      return endSpan(span, () => callback(span, context));
    }

    return _context.with(context, () => startSpanManual(spanOptions, span => endSpan(span, () => callback(span, context))));
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
      attributes,
      kind: engineSpan.kind === 'client' ? SPAN_KIND.CLIENT : SPAN_KIND.INTERNAL,
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
