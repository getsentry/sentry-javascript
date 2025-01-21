import type { Client } from '../client';
import { DEFAULT_ENVIRONMENT } from '../constants';
import { getClient } from '../currentScopes';
import type { Scope } from '../scope';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
import type { DynamicSamplingContext, Span } from '../types-hoist';
import {
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
} from '../utils-hoist/baggage';
import { dropUndefinedKeys } from '../utils-hoist/object';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { getRootSpan, spanIsSampled, spanToJSON } from '../utils/spanUtils';
import { getCapturedScopesOnSpan } from './utils';

/**
 * Creates a dynamic sampling context from a client.
 *
 * Dispatches the `createDsc` lifecycle hook as a side effect.
 */
export function getDynamicSamplingContextFromClient(trace_id: string, client: Client): DynamicSamplingContext {
  const options = client.getOptions();

  const { publicKey: public_key } = client.getDsn() || {};

  const dsc = dropUndefinedKeys({
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    public_key,
    trace_id,
  }) as DynamicSamplingContext;

  client.emit('createDsc', dsc);

  return dsc;
}

/**
 * Get the dynamic sampling context for the currently active scopes.
 */
export function getDynamicSamplingContextFromScope(client: Client, scope: Scope): Partial<DynamicSamplingContext> {
  const propagationContext = scope.getPropagationContext();
  return propagationContext.dsc || getDynamicSamplingContextFromClient(propagationContext.traceId, client);
}

/**
 * Creates a dynamic sampling context from a span (and client and scope)
 *
 * @param span the span from which a few values like the root span name and sample rate are extracted.
 *
 * @returns a dynamic sampling context
 */
export function getDynamicSamplingContextFromSpan(span: Span): Readonly<Partial<DynamicSamplingContext>> {
  const client = getClient();
  if (!client) {
    return {};
  }

  const rootSpan = getRootSpan(span);

  // For OpenTelemetry, we freeze the DSC on the trace state
  const traceState = rootSpan.spanContext().traceState;
  const traceStateDsc = traceState?.get('sentry.dsc');

  // If the span has a DSC, we want it to take precedence
  const dscOnTraceState = traceStateDsc && baggageHeaderToDynamicSamplingContext(traceStateDsc);

  if (dscOnTraceState) {
    return dscOnTraceState;
  }

  // Else, we generate it from the span
  const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);
  const jsonSpan = spanToJSON(rootSpan);
  const attributes = jsonSpan.data;
  const maybeSampleRate = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];

  if (maybeSampleRate != null) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

  // after JSON conversion, txn.name becomes jsonSpan.description
  const name = jsonSpan.description;
  if (source !== 'url' && name) {
    dsc.transaction = name;
  }

  // How can we even land here with hasTracingEnabled() returning false?
  // Otel creates a Non-recording span in Tracing Without Performance mode when handling incoming requests
  // So we end up with an active span that is not sampled (neither positively nor negatively)
  if (hasTracingEnabled()) {
    dsc.sampled = String(spanIsSampled(rootSpan));
    dsc.sample_rand =
      // In OTEL we store the sample rand on the trace state because we cannot access scopes for NonRecordingSpans
      // The Sentry OTEL SpanSampler takes care of writing the sample rand on the root span
      traceState?.get('sentry.sample_rand') ??
      // On all other platforms we can actually get the scopes from a root span (we use this as a fallback)
      getCapturedScopesOnSpan(rootSpan)
        .scope?.getPropagationContext()
        .sampleRand.toString();
  }

  client.emit('createDsc', dsc, rootSpan);

  return dsc;
}

/**
 * Convert a Span to a baggage header.
 */
export function spanToBaggageHeader(span: Span): string | undefined {
  const dsc = getDynamicSamplingContextFromSpan(span);
  return dynamicSamplingContextToSentryBaggageHeader(dsc);
}
