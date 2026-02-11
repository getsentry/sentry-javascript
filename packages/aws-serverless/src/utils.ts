import type { Context as OtelContext, TextMapGetter } from '@opentelemetry/api';
import { context as otelContext, propagation } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { addExceptionMechanism, isString } from '@sentry/core';
import type { APIGatewayProxyEventHeaders, Handler } from 'aws-lambda';

type HandlerEvent = Parameters<Handler<{ headers?: Record<string, string> }>>[0];
type HandlerContext = Parameters<Handler>[1];

type TraceData = {
  'sentry-trace'?: string;
  baggage?: string;
};

// vendored from
// https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-aws-lambda/src/instrumentation.ts#L65-L72
const headerGetter: TextMapGetter<APIGatewayProxyEventHeaders> = {
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier[key];
  },
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
 * is placed on `context.clientContext.Custom`. Users are free to modify context
 * tho and provide this data via `event` or `context`.
 */
export function getAwsTraceData(event: HandlerEvent, context?: HandlerContext): TraceData {
  const headers = event.headers || {};

  const traceData: TraceData = {
    'sentry-trace': headers['sentry-trace'],
    baggage: headers.baggage,
  };

  if (context?.clientContext?.Custom) {
    const customContext: Record<string, unknown> = context.clientContext.Custom;
    const sentryTrace = isString(customContext['sentry-trace']) ? customContext['sentry-trace'] : undefined;

    if (sentryTrace) {
      traceData['sentry-trace'] = sentryTrace;
      traceData.baggage = isString(customContext.baggage) ? customContext.baggage : undefined;
    }
  }

  return traceData;
}

/**
 * A custom event context extractor for the aws integration. It takes sentry trace data
 * from the context rather than the event, with the event being a fallback.
 *
 * Is only used when the handler was successfully wrapped by otel and the integration option
 * `disableAwsContextPropagation` is `true`.
 */
export function eventContextExtractor(event: HandlerEvent, context?: HandlerContext): OtelContext {
  // The default context extractor tries to get sampled trace headers from HTTP headers
  // The otel aws integration packs these onto the context, so we try to extract them from
  // there instead.
  const httpHeaders = {
    ...(event.headers || {}),
    ...getAwsTraceData(event, context),
  };

  return propagation.extract(otelContext.active(), httpHeaders, headerGetter);
}
