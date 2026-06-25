import type { Scope } from '@sentry/core';
import { addExceptionMechanism, isString } from '@sentry/core';
import type { Handler } from 'aws-lambda';

type HandlerEvent = Parameters<Handler<{ headers?: Record<string, string> }>>[0];
type HandlerContext = Parameters<Handler>[1];

type TraceData = {
  'sentry-trace'?: string;
  baggage?: string;
};

/**
 * Marks an event as unhandled by adding a span processor to the passed scope.
 */
export function markEventUnhandled(scope: Scope, type: string): Scope {
  scope.addEventProcessor(event => {
    addExceptionMechanism(event, { handled: false, type });
    return event;
  });

  return scope;
}

/**
 * Extracts sentry trace data from the handler `context` if available and falls
 * back to the `event`.
 *
 * When instrumenting the Lambda function with Sentry, the sentry trace data
 * is placed on `context.clientContext.custom`. Users are free to modify context
 * tho and provide this data via `event` or `context`.
 */
export function getAwsTraceData(event: HandlerEvent, context?: HandlerContext): TraceData {
  const headers = event.headers || {};

  const traceData: TraceData = {
    'sentry-trace': headers['sentry-trace'],
    baggage: headers.baggage,
  };

  if (context?.clientContext?.custom) {
    const customContext: Record<string, unknown> = context.clientContext.custom;
    const sentryTrace = isString(customContext['sentry-trace']) ? customContext['sentry-trace'] : undefined;

    if (sentryTrace) {
      traceData['sentry-trace'] = sentryTrace;
      traceData.baggage = isString(customContext.baggage) ? customContext.baggage : undefined;
    }
  }

  return traceData;
}
