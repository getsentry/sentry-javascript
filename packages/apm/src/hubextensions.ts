import { getMainCarrier, Hub } from '@sentry/hub';
import { SpanContext } from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';

import { Span } from './span';

/**
 * Checks whether given value is instance of Span
 * @param span value to check
 */
function isSpanInstance(span: unknown): span is Span {
  return isInstanceOf(span, Span);
}

/** Returns all trace headers that are currently on the top scope. */
function traceHeaders(): { [key: string]: string } {
  // @ts-ignore
  const that = this as Hub;
  const scope = that.getScope();
  if (scope) {
    const span = scope.getSpan();
    if (span) {
      return {
        'sentry-trace': span.toTraceparent(),
      };
    }
  }
  return {};
}

/**
 * This functions starts a span. If argument passed is of type `Span`, it'll run sampling on it if configured
 * and attach a `SpanRecorder`. If it's of type `SpanContext` and there is already a `Span` on the Scope,
 * the created Span will have a reference to it and become it's child. Otherwise it'll crete a new `Span`.
 *
 * @param span Already constructed span which should be started or properties with which the span should be created
 */
function startSpan(spanOrSpanContext?: Span | SpanContext, forceNoChild: boolean = false): Span {
  // @ts-ignore
  const that = this as Hub;
  const scope = that.getScope();
  const client = that.getClient();
  let span;

  if (!isSpanInstance(spanOrSpanContext) && !forceNoChild) {
    if (scope) {
      const parentSpan = scope.getSpan() as Span;
      if (parentSpan) {
        span = parentSpan.child(spanOrSpanContext);
      }
    }
  }

  if (!isSpanInstance(span)) {
    span = new Span(spanOrSpanContext, that);
  }

  if (span.sampled === undefined && span.transaction !== undefined) {
    const sampleRate = (client && client.getOptions().tracesSampleRate) || 0;
    span.sampled = Math.random() < sampleRate;
  }

  if (span.sampled) {
    const experimentsOptions = (client && client.getOptions()._experiments) || {};
    span.initFinishedSpans(experimentsOptions.maxSpans as number);
  }

  return span;
}

/**
 * This patches the global object and injects the APM extensions methods
 */
export function addExtensionMethods(): void {
  const carrier = getMainCarrier();
  if (carrier.__SENTRY__) {
    carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
    if (!carrier.__SENTRY__.extensions.startSpan) {
      carrier.__SENTRY__.extensions.startSpan = startSpan;
    }
    if (!carrier.__SENTRY__.extensions.traceHeaders) {
      carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
    }
  }
}
