import type { Client } from '../client';
import { DEFAULT_ENVIRONMENT } from '../constants';
import { getClient, getExternalPropagationContext } from '../currentScopes';
import type { Scope } from '../scope';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../semanticAttributes';
import type { DynamicSamplingContext } from '../types/envelope';
import type { Span } from '../types/span';
import { baggageHeaderToDynamicSamplingContext, dynamicSamplingContextToSentryBaggageHeader } from '../utils/baggage';
import { extractOrgIdFromClient } from '../utils/dsn';
import { hasSpansEnabled } from '../utils/hasSpansEnabled';
import { addNonEnumerableProperty } from '../utils/object';
import { getRootSpan, spanIsSampled, spanToStaticSpanJSON } from '../utils/spanUtils';
import { spanIsNonRecordingSpan } from './sentryNonRecordingSpan';
import { getCapturedScopesOnSpan } from './utils';

/**
 * If you change this value, also update the terser plugin config to
 * avoid minification of the object property!
 */
const FROZEN_DSC_FIELD = '_frozenDsc';

type SpanWithMaybeDsc = Span & {
  [FROZEN_DSC_FIELD]?: Partial<DynamicSamplingContext> | undefined;
};

/**
 * Freeze the given DSC on the given span.
 */
export function freezeDscOnSpan(span: Span, dsc: Partial<DynamicSamplingContext>): void {
  const spanWithMaybeDsc = span as SpanWithMaybeDsc;
  addNonEnumerableProperty(spanWithMaybeDsc, FROZEN_DSC_FIELD, dsc);
}

/**
 * Creates a dynamic sampling context from a client.
 *
 * Dispatches the `createDsc` lifecycle hook as a side effect.
 */
export function getDynamicSamplingContextFromClient(trace_id: string, client: Client): DynamicSamplingContext {
  const options = client.getOptions();

  const { publicKey: public_key } = client.getDsn() || {};

  // Instead of conditionally adding non-undefined values, we add them and then remove them if needed
  // otherwise, the order of baggage entries changes, which "breaks" a bunch of tests etc.
  const dsc: DynamicSamplingContext = {
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    public_key,
    trace_id,
    org_id: extractOrgIdFromClient(client),
  };

  client.emit('createDsc', dsc);

  return dsc;
}

/**
 * Get the dynamic sampling context for the currently active scopes.
 */
export function getDynamicSamplingContextFromScope(
  client: Client,
  scope: Scope,
): Partial<DynamicSamplingContext> | undefined {
  // While an external propagation context is active (e.g. the OTLP integration riding along on an
  // OpenTelemetry span), the SDK lacks most of the DSC information, like sampled, sample_rate,
  // sample_rand and transaction. The scope's own DSC would also name a different trace than the one
  // stamped on the event, so send none at all. Matches sentry-python.
  if (getExternalPropagationContext()) {
    return undefined;
  }

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
  const rootSpanJson = spanToStaticSpanJSON(rootSpan);
  const rootSpanAttributes = rootSpanJson.data;
  const traceState = rootSpan.spanContext().traceState;

  // The span sample rate that was locally applied to the root span should also always be applied to the DSC, even if the DSC is frozen.
  // This is so that the downstream traces/services can use parentSampleRate in their `tracesSampler` to make consistent sampling decisions across the entire trace.
  const rootSpanSampleRate =
    traceState?.get('sentry.sample_rate') ??
    rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] ??
    rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE];

  function applyLocalSampleRateToDsc(dsc: Partial<DynamicSamplingContext>): Partial<DynamicSamplingContext> {
    if (typeof rootSpanSampleRate === 'number' || typeof rootSpanSampleRate === 'string') {
      dsc.sample_rate = `${rootSpanSampleRate}`;
    }
    return dsc;
  }

  // For core implementation, we freeze the DSC onto the span as a non-enumerable property
  const frozenDsc = (rootSpan as SpanWithMaybeDsc)[FROZEN_DSC_FIELD];
  if (frozenDsc) {
    return applyLocalSampleRateToDsc(frozenDsc);
  }

  // For a non-recording placeholder in Tracing without Performance (TwP) mode or an ignored segment,
  // the DSC is not carried on the span; the scope is the source of truth. Resolve it from the span's
  // captured scope so continued traces keep their incoming DSC.
  //
  // We gate this on `!hasSpansEnabled()` so it mirrors the `sentry-trace` source in `getTraceData`:
  // with tracing enabled, other non-recording spans (e.g. an `onlyIfParent` placeholder) keep deriving
  // their DSC from the span/client. Ignored segments are an explicit exception: they preserve the
  // incoming DSC but override its sampling decision to agree with the propagated `sentry-trace`.
  //
  // We spread into a new object so applying the local sample rate can't mutate the scope's DSC.
  const isNonRecordingRoot = spanIsNonRecordingSpan(rootSpan);
  const isIgnoredRoot = isNonRecordingRoot && rootSpan.dropReason === 'ignored';
  if (isNonRecordingRoot && (!hasSpansEnabled(client.getOptions()) || isIgnoredRoot)) {
    const capturedScope = getCapturedScopesOnSpan(rootSpan).scope;
    // The scope yields no DSC while an external propagation context is active. We do have a Sentry
    // span here though, so we are head of *its* trace: fall through and derive the DSC from the span
    // rather than emitting an empty one.
    const scopeDsc = capturedScope && getDynamicSamplingContextFromScope(client, capturedScope);
    if (scopeDsc) {
      const dsc = { ...scopeDsc };
      if (isIgnoredRoot) {
        dsc.sampled = 'false';
      }
      return applyLocalSampleRateToDsc(dsc);
    }
  }

  // For OpenTelemetry, we freeze the DSC on the trace state
  const traceStateDsc = traceState?.get('sentry.dsc');

  // If the span has a DSC, we want it to take precedence
  const dscOnTraceState = traceStateDsc && baggageHeaderToDynamicSamplingContext(traceStateDsc);

  if (dscOnTraceState) {
    return applyLocalSampleRateToDsc(dscOnTraceState);
  }

  // Else, we generate it from the span
  const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  // TODO(v11): Only read `SENTRY_SEGMENT_NAME_SOURCE` once we removed `SEMANTIC_ATTRIBUTE_SENTRY_SOURCE`
  const source =
    rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] ?? rootSpanAttributes['sentry.segment.name.source'];

  // after JSON conversion, txn.name becomes jsonSpan.description
  const name = rootSpanJson.description;
  if (source !== 'url' && name) {
    dsc.transaction = name;
  }

  // How can we even land here with hasSpansEnabled() returning false?
  // Otel creates a Non-recording span in Tracing Without Performance mode when handling incoming requests
  // So we end up with an active span that is not sampled (neither positively nor negatively)
  if (hasSpansEnabled()) {
    dsc.sampled = String(spanIsSampled(rootSpan));
    dsc.sample_rand =
      // In OTEL we store the sample rand on the trace state because we cannot access scopes for NonRecordingSpans
      // The Sentry OTEL SpanSampler takes care of writing the sample rand on the root span
      traceState?.get('sentry.sample_rand') ??
      // On all other platforms we can actually get the scopes from a root span (we use this as a fallback)
      getCapturedScopesOnSpan(rootSpan).scope?.getPropagationContext().sampleRand.toString();
  }

  applyLocalSampleRateToDsc(dsc);

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
