import type { Span } from '@opentelemetry/api';
import {
  extractTraceparentData,
  getActiveSpan,
  getCurrentScope,
  spanToTraceHeader,
  withActiveSpan,
  withIsolationScope,
} from '@sentry/core';
import type { ContextManager, SentryContext } from './types';

export class SentryBullMQContextManager implements ContextManager<SentryContext> {
  public active(): SentryContext {
    return {
      span: getActiveSpan(),
      scope: getCurrentScope(),
    };
  }

  public with<A extends (...args: unknown[]) => unknown>(context: SentryContext, fn: A): ReturnType<A> {
    if (context.span) {
      return withIsolationScope(() => {
        return withActiveSpan(context.span as Span, fn) as ReturnType<A>;
      });
    }
    return withIsolationScope(fn) as ReturnType<A>;
  }

  public getMetadata(context: SentryContext): string {
    if (context.span) {
      return spanToTraceHeader(context.span);
    }
    return '';
  }

  public fromMetadata(activeContext: SentryContext, metadata: string): SentryContext {
    const traceparent = extractTraceparentData(metadata);
    if (!traceparent?.traceId || !traceparent?.parentSpanId) {
      return activeContext;
    }

    return {
      ...activeContext,
      producerSpanContext: {
        traceId: traceparent.traceId,
        spanId: traceparent.parentSpanId,
        sampled: traceparent.parentSampled === true,
      },
    };
  }
}
