import { getAsyncContextStrategy } from '../asyncContext';
import { getMainCarrier } from '../carrier';
import type { Client } from '../client';
import { getClient, getCurrentScope, hasExternalPropagationContext } from '../currentScopes';
import { isEnabled } from '../exports';
import type { Scope } from '../scope';
import { getDynamicSamplingContextFromScope, getDynamicSamplingContextFromSpan } from '../tracing';
import { SentryNonRecordingSpan } from '../tracing/sentryNonRecordingSpan';
import type { Span } from '../types/span';
import type { SerializedTraceData } from '../types/tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from './baggage';
import { debug } from './debug-logger';
import { getActiveSpan, spanToTraceHeader, spanToTraceparentHeader } from './spanUtils';
import { generateSentryTraceHeader, generateTraceparentHeader, TRACEPARENT_REGEXP } from './tracing';

/**
 * Extracts trace propagation data from the current span or from the client's scope (via transaction or propagation
 * context) and serializes it to `sentry-trace` and `baggage` values. These values can be used to propagate
 * a trace via our tracing Http headers or Html `<meta>` tags.
 *
 * This function also applies some validation to the generated sentry-trace and baggage values to ensure that
 * only valid strings are returned.
 *
 * When an external propagation context is registered (e.g. via the OTLP integration) and there is no active
 * Sentry span, this function returns an empty object to defer outgoing request propagation to the external
 * propagator (e.g. an OpenTelemetry propagator).
 *
 * If (@param options.propagateTraceparent) is `true`, the function will also generate a `traceparent` value,
 * following the W3C traceparent header format.
 *
 * @returns an object with the tracing data values. The object keys are the name of the tracing key to be used as header
 * or meta tag name.
 */
export function getTraceData(
  options: { span?: Span; scope?: Scope; client?: Client; propagateTraceparent?: boolean } = {},
): SerializedTraceData {
  const client = options.client || getClient();
  if (!isEnabled() || !client) {
    return {};
  }

  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  if (acs.getTraceData) {
    return acs.getTraceData(options);
  }

  const scope = options.scope || getCurrentScope();
  const span = options.span || getActiveSpan();

  // A non-recording span is a Tracing-without-Performance placeholder that carries no sampling
  // decision of its own — the scope is the source of truth. We keep the placeholder's (stable)
  // span id but read the sampling decision from the scope.
  const isNonRecordingSpan = span instanceof SentryNonRecordingSpan;

  // When there's no recording span and an external propagation context is registered (e.g. OTLP
  // integration), return empty to let the external propagator handle outgoing request propagation.
  if (!span && hasExternalPropagationContext()) {
    return {};
  }

  const sentryTrace =
    span && !isNonRecordingSpan ? spanToTraceHeader(span) : scopeToTraceHeader(scope, span?.spanContext().spanId);
  const dsc = span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromScope(client, scope);
  const baggage = dynamicSamplingContextToSentryBaggageHeader(dsc);

  const isValidSentryTraceHeader = TRACEPARENT_REGEXP.test(sentryTrace);
  if (!isValidSentryTraceHeader) {
    debug.warn('Invalid sentry-trace data. Cannot generate trace data');
    return {};
  }

  const traceData: SerializedTraceData = {
    'sentry-trace': sentryTrace,
    baggage,
  };

  if (options.propagateTraceparent) {
    traceData.traceparent =
      span && !isNonRecordingSpan
        ? spanToTraceparentHeader(span)
        : scopeToTraceparentHeader(scope, span?.spanContext().spanId);
  }

  return traceData;
}

/**
 * Get a sentry-trace header value for the given scope.
 *
 * `spanId` overrides the scope's propagation span id — used to keep a non-recording placeholder's
 * (stable) span id while still taking the sampling decision from the scope.
 */
function scopeToTraceHeader(scope: Scope, spanId?: string): string {
  const { traceId, sampled, propagationSpanId } = scope.getPropagationContext();
  return generateSentryTraceHeader(traceId, spanId ?? propagationSpanId, sampled);
}

function scopeToTraceparentHeader(scope: Scope, spanId?: string): string {
  const { traceId, sampled, propagationSpanId } = scope.getPropagationContext();
  return generateTraceparentHeader(traceId, spanId ?? propagationSpanId, sampled);
}
