/*
 * Copyright Prisma
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation
 * - Upstream version: @prisma/instrumentation@7.8.0
 * - Replaced `@prisma/instrumentation-contract` imports with local vendored types
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import {
  Attributes,
  Context,
  context as _context,
  Span,
  SpanKind,
  SpanOptions,
  trace,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import type { EngineSpan, EngineSpanKind, ExtendedSpanOptions, SpanCallback, TracingHelper } from './types';

const showAllTraces = process.env.PRISMA_SHOW_ALL_TRACES === 'true';

const nonSampledTraceParent = `00-10-10-00`;

type Options = {
  tracerProvider: TracerProvider;
  ignoreSpanTypes: (string | RegExp)[];
};

function engineSpanKindToOtelSpanKind(engineSpanKind: EngineSpanKind): SpanKind {
  switch (engineSpanKind) {
    case 'client':
      return SpanKind.CLIENT;
    case 'internal':
    default:
      return SpanKind.INTERNAL;
  }
}

export class ActiveTracingHelper implements TracingHelper {
  private tracerProvider: TracerProvider;
  private ignoreSpanTypes: (string | RegExp)[];

  constructor({ tracerProvider, ignoreSpanTypes }: Options) {
    this.tracerProvider = tracerProvider;
    this.ignoreSpanTypes = ignoreSpanTypes;
  }

  isEnabled(): boolean {
    return true;
  }

  getTraceParent(context?: Context | undefined): string {
    const span = trace.getSpanContext(context ?? _context.active());
    if (span) {
      return `00-${span.traceId}-${span.spanId}-0${span.traceFlags}`;
    }
    return nonSampledTraceParent;
  }

  dispatchEngineSpans(spans: EngineSpan[]): void {
    const tracer = this.tracerProvider.getTracer('prisma');
    const linkIds = new Map<string, string>();
    const roots = spans.filter(span => span.parentId === null);

    for (const root of roots) {
      dispatchEngineSpan(tracer, root, spans, linkIds, this.ignoreSpanTypes);
    }
  }

  getActiveContext(): Context | undefined {
    return _context.active();
  }

  runInChildSpan<R>(options: string | ExtendedSpanOptions, callback: SpanCallback<R>): R {
    if (typeof options === 'string') {
      options = { name: options };
    }

    if (options.internal && !showAllTraces) {
      return callback();
    }

    const tracer = this.tracerProvider.getTracer('prisma');
    const context = options.context ?? this.getActiveContext();
    const name = `prisma:client:${options.name}`;

    if (shouldIgnoreSpan(name, this.ignoreSpanTypes)) {
      return callback();
    }

    if (options.active === false) {
      const span = tracer.startSpan(name, options, context);
      return endSpan(span, callback(span, context));
    }

    return tracer.startActiveSpan(name, options, span => endSpan(span, callback(span, context)));
  }
}

function dispatchEngineSpan(
  tracer: Tracer,
  engineSpan: EngineSpan,
  allSpans: EngineSpan[],
  linkIds: Map<string, string>,
  ignoreSpanTypes: (string | RegExp)[],
) {
  if (shouldIgnoreSpan(engineSpan.name, ignoreSpanTypes)) return;

  const spanOptions = {
    attributes: engineSpan.attributes as Attributes,
    kind: engineSpanKindToOtelSpanKind(engineSpan.kind),
    startTime: engineSpan.startTime,
  } satisfies SpanOptions;

  tracer.startActiveSpan(engineSpan.name, spanOptions, span => {
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
      dispatchEngineSpan(tracer, child, allSpans, linkIds, ignoreSpanTypes);
    }

    span.end(engineSpan.endTime);
  });
}

function endSpan<T>(span: Span, result: T): T {
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
