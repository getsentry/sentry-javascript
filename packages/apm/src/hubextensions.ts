import { getMainCarrier, Hub } from '@sentry/hub';
import { SpanContext } from '@sentry/types';

import { Span } from './span';

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
 * This functions starts a span. If there is already a `Span` on the Scope,
 * the created Span with the SpanContext will have a reference to it and become it's child.
 * Otherwise it'll crete a new `Span`.
 *
 * @param spanContext Properties with which the span should be created
 */
function startSpan(spanContext?: SpanContext): Span {
  // @ts-ignore
  const hub = this as Hub;
  const scope = hub.getScope();
  const client = hub.getClient();
  let span;

  // This flag determines if we already added the span as a child to the span that currently lives on the scope
  // If we do not have this, we will add it later on twice to the span recorder and therefore have too many spans
  let addedAsChild = false;

  if (scope) {
    const parentSpan = scope.getSpan() as Span;
    if (parentSpan) {
      span = parentSpan.child(spanContext);
      addedAsChild = true;
    }
  }

  if (!span) {
    span = new Span(spanContext, hub);
  }

  // We only roll the dice on sampling for "root" spans (transactions) because the childs inherit this state
  if (span.sampled === undefined && span.isRootSpan()) {
    const sampleRate = (client && client.getOptions().tracesSampleRate) || 0;
    span.sampled = Math.random() < sampleRate;
  }

  // We only want to create a span list if we sampled the transaction
  // in case we will discard the span anyway because sampled == false, we safe memory and do not store child spans
  if (span.sampled && !addedAsChild) {
    const experimentsOptions = (client && client.getOptions()._experiments) || {};
    span.initSpanRecorder(experimentsOptions.maxSpans as number);
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
