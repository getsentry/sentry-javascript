import { Hub as BaseHub } from '@sentry/hub';
import { Hub as BaseHubInterface, SpanContext } from '@sentry/types';

import { Span } from './span';

/**
 * Checks whether given value is instance of Span
 * @param span value to check
 */
function isSpanInstance(span: unknown): span is Span {
  return span instanceof Span;
}

/**
 * Hub with APM extension methods
 */
export interface ApmHubInterface extends BaseHubInterface {
  /** Returns all trace headers that are currently on the top scope. */
  traceHeaders(): { [key: string]: string };

  /**
   * This functions starts a span. If argument passed is of type `Span`, it'll run sampling on it if configured
   * and attach a `SpanRecorder`. If it's of type `SpanContext` and there is already a `Span` on the Scope,
   * the created Span will have a reference to it and become it's child. Otherwise it'll crete a new `Span`.
   *
   * @param span Already constructed span which should be started or properties with which the span should be created
   */
  startSpan(span?: Span | SpanContext, forceNoChild?: boolean): Span;
}

/**
 * APM Hub
 */
export class Hub extends BaseHub implements ApmHubInterface {
  /**
   * @inheritDoc
   */
  public traceHeaders(): { [key: string]: string } {
    const scope = this.getScope();
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
   * @inheritDoc
   */
  public startSpan(spanOrSpanContext?: Span | SpanContext, forceNoChild: boolean = false): Span {
    const scope = this.getScope();
    const client = this.getClient();
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
      span = new Span(spanOrSpanContext, this);
    }

    if (span.sampled === undefined && span.transaction !== undefined) {
      const sampleRate = (client && client.getOptions().tracesSampleRate) || 0;
      span.sampled = Math.random() < sampleRate;
    }

    if (span.sampled) {
      const experimentsOptions = (client && client.getOptions()._experiments) || {};
      span.initFinishedSpans(experimentsOptions.maxSpans);
    }

    return span;
  }
}
