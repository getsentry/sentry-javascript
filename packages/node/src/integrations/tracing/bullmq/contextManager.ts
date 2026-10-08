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
    return withIsolationScope(() => withActiveSpan(null, fn)) as ReturnType<A>;
  }

  /**
   * Returns a context without a span. BullMQ 6.3.11+ runs the stalled jobs checker in it, so the
   * checker does not stay attached to the span that was active when the worker started.
   */
  public root(): SentryContext {
    return {
      span: undefined,
      scope: getCurrentScope(),
    };
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
