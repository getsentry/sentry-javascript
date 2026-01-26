/* eslint-disable complexity */
import type { Context, Span, TraceState as TraceStateInterface } from '@opentelemetry/api';
import { isSpanContextValid, SpanKind, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_URL_FULL,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_URL,
} from '@opentelemetry/semantic-conventions';
import type { Client, SpanAttributes } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  baggageHeaderToDynamicSamplingContext,
  debug,
  hasSpansEnabled,
  parseSampleRate,
  sampleSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import {
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_SAMPLE_RAND,
  SENTRY_TRACE_STATE_SAMPLE_RATE,
  SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING,
  SENTRY_TRACE_STATE_URL,
} from './constants';
import { DEBUG_BUILD } from './debug-build';
import { getScopesFromContext } from './utils/contextData';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { inferSpanData } from './utils/parseSpanDescription';
import { setIsSetup } from './utils/setupCheck';

/**
 * A custom OTEL sampler that uses Sentry sampling rates to make its decision
 */
export class SentrySampler implements Sampler {
  private _client: Client;

  public constructor(client: Client) {
    this._client = client;
    setIsSetup('SentrySampler');
  }

  /** @inheritDoc */
  public shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    spanAttributes: SpanAttributes,
    _links: unknown,
  ): SamplingResult {
    const options = this._client.getOptions();

    const parentSpan = getValidSpan(context);
    const parentContext = parentSpan?.spanContext();

    if (!hasSpansEnabled(options)) {
      return wrapSamplingDecision({ decision: undefined, context, spanAttributes });
    }

    // `ATTR_HTTP_REQUEST_METHOD` is the new attribute, but we still support the old one, `SEMATTRS_HTTP_METHOD`, for now.
    // eslint-disable-next-line deprecation/deprecation
    const maybeSpanHttpMethod = spanAttributes[SEMATTRS_HTTP_METHOD] || spanAttributes[ATTR_HTTP_REQUEST_METHOD];

    // If we have a http.client span that has no local parent, we never want to sample it
    // but we want to leave downstream sampling decisions up to the server
    if (spanKind === SpanKind.CLIENT && maybeSpanHttpMethod && (!parentSpan || parentContext?.isRemote)) {
      return wrapSamplingDecision({ decision: undefined, context, spanAttributes });
    }

    const parentSampled = parentSpan ? getParentSampled(parentSpan, traceId, spanName) : undefined;
    const isRootSpan = !parentSpan || parentContext?.isRemote;

    // We only sample based on parameters (like tracesSampleRate or tracesSampler) for root spans (which is done in sampleSpan).
    // Non-root-spans simply inherit the sampling decision from their parent.
    if (!isRootSpan) {
      return wrapSamplingDecision({
        decision: parentSampled ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
        context,
        spanAttributes,
      });
    }

    // We want to pass the inferred name & attributes to the sampler method
    const {
      description: inferredSpanName,
      data: inferredAttributes,
      op,
    } = inferSpanData(spanName, spanAttributes, spanKind);

    const mergedAttributes = {
      ...inferredAttributes,
      ...spanAttributes,
    };

    if (op) {
      mergedAttributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
    }

    const mutableSamplingDecision = { decision: true };
    this._client.emit(
      'beforeSampling',
      {
        spanAttributes: mergedAttributes,
        spanName: inferredSpanName,
        parentSampled: parentSampled,
        parentContext: parentContext,
      },
      mutableSamplingDecision,
    );
    if (!mutableSamplingDecision.decision) {
      return wrapSamplingDecision({ decision: undefined, context, spanAttributes });
    }

    const { isolationScope } = getScopesFromContext(context) ?? {};

    const dscString = parentContext?.traceState ? parentContext.traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
    const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;

    const sampleRand = parseSampleRate(dsc?.sample_rand) ?? _INTERNAL_safeMathRandom();

    const [sampled, sampleRate, localSampleRateWasApplied] = sampleSpan(
      options,
      {
        name: inferredSpanName,
        attributes: mergedAttributes,
        normalizedRequest: isolationScope?.getScopeData().sdkProcessingMetadata.normalizedRequest,
        parentSampled,
        parentSampleRate: parseSampleRate(dsc?.sample_rate),
      },
      sampleRand,
    );

    const method = `${maybeSpanHttpMethod}`.toUpperCase();
    if (method === 'OPTIONS' || method === 'HEAD') {
      DEBUG_BUILD && debug.log(`[Tracing] Not sampling span because HTTP method is '${method}' for ${spanName}`);

      return wrapSamplingDecision({
        decision: SamplingDecision.NOT_RECORD,
        context,
        spanAttributes,
        sampleRand,
        downstreamTraceSampleRate: 0, // we don't want to sample anything in the downstream trace either
      });
    }

    if (
      !sampled &&
      // We check for `parentSampled === undefined` because we only want to record client reports for spans that are trace roots (ie. when there was incoming trace)
      parentSampled === undefined
    ) {
      DEBUG_BUILD && debug.log('[Tracing] Discarding root span because its trace was not chosen to be sampled.');
      this._client.recordDroppedEvent('sample_rate', 'transaction');
    }

    return {
      ...wrapSamplingDecision({
        decision: sampled ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
        context,
        spanAttributes,
        sampleRand,
        downstreamTraceSampleRate: localSampleRateWasApplied ? sampleRate : undefined,
      }),
      attributes: {
        // We set the sample rate on the span when a local sample rate was applied to better understand how traces were sampled in Sentry
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: localSampleRateWasApplied ? sampleRate : undefined,
      },
    };
  }

  /** Returns the sampler name or short description with the configuration. */
  public toString(): string {
    return 'SentrySampler';
  }
}

function getParentSampled(parentSpan: Span, traceId: string, spanName: string): boolean | undefined {
  const parentContext = parentSpan.spanContext();

  // Only inherit sample rate if `traceId` is the same
  // Note for testing: `isSpanContextValid()` checks the format of the traceId/spanId, so we need to pass valid ones
  if (isSpanContextValid(parentContext) && parentContext.traceId === traceId) {
    if (parentContext.isRemote) {
      const parentSampled = getSamplingDecision(parentSpan.spanContext());
      DEBUG_BUILD &&
        debug.log(`[Tracing] Inheriting remote parent's sampled decision for ${spanName}: ${parentSampled}`);
      return parentSampled;
    }

    const parentSampled = getSamplingDecision(parentContext);
    DEBUG_BUILD && debug.log(`[Tracing] Inheriting parent's sampled decision for ${spanName}: ${parentSampled}`);
    return parentSampled;
  }

  return undefined;
}

/**
 * Wrap a sampling decision with data that Sentry needs to work properly with it.
 * If you pass `decision: undefined`, it will be treated as `NOT_RECORDING`, but in contrast to passing `NOT_RECORDING`
 * it will not propagate this decision to downstream Sentry SDKs.
 */
export function wrapSamplingDecision({
  decision,
  context,
  spanAttributes,
  sampleRand,
  downstreamTraceSampleRate,
}: {
  decision: SamplingDecision | undefined;
  context: Context;
  spanAttributes: SpanAttributes;
  sampleRand?: number;
  downstreamTraceSampleRate?: number;
}): SamplingResult {
  let traceState = getBaseTraceState(context, spanAttributes);

  // We will override the propagated sample rate downstream when
  // - the tracesSampleRate is applied
  // - the tracesSampler is invoked
  // Since unsampled OTEL spans (NonRecordingSpans) cannot hold attributes we need to store this on the (trace)context.
  if (downstreamTraceSampleRate !== undefined) {
    traceState = traceState.set(SENTRY_TRACE_STATE_SAMPLE_RATE, `${downstreamTraceSampleRate}`);
  }

  if (sampleRand !== undefined) {
    traceState = traceState.set(SENTRY_TRACE_STATE_SAMPLE_RAND, `${sampleRand}`);
  }

  // If the decision is undefined, we treat it as NOT_RECORDING, but we don't propagate this decision to downstream SDKs
  // Which is done by not setting `SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING` traceState
  if (decision == undefined) {
    return { decision: SamplingDecision.NOT_RECORD, traceState };
  }

  if (decision === SamplingDecision.NOT_RECORD) {
    return { decision, traceState: traceState.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') };
  }

  return { decision, traceState };
}

function getBaseTraceState(context: Context, spanAttributes: SpanAttributes): TraceStateInterface {
  const parentSpan = trace.getSpan(context);
  const parentContext = parentSpan?.spanContext();

  let traceState = parentContext?.traceState || new TraceState();

  // We always keep the URL on the trace state, so we can access it in the propagator
  // `ATTR_URL_FULL` is the new attribute, but we still support the old one, `ATTR_HTTP_URL`, for now.
  // eslint-disable-next-line deprecation/deprecation
  const url = spanAttributes[SEMATTRS_HTTP_URL] || spanAttributes[ATTR_URL_FULL];
  if (url && typeof url === 'string') {
    traceState = traceState.set(SENTRY_TRACE_STATE_URL, url);
  }

  return traceState;
}

/**
 * If the active span is invalid, we want to ignore it as parent.
 * This aligns with how otel tracers and default samplers handle these cases.
 */
function getValidSpan(context: Context): Span | undefined {
  const span = trace.getSpan(context);
  return span && isSpanContextValid(span.spanContext()) ? span : undefined;
}
