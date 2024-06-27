import type { Attributes, Context, Span, TraceState as TraceStateInterface } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, hasTracingEnabled, sampleSpan } from '@sentry/core';
import type { Client, SpanAttributes } from '@sentry/types';
import { logger } from '@sentry/utils';
import { SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, SENTRY_TRACE_STATE_URL } from './constants';

import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import { DEBUG_BUILD } from './debug-build';
import { getPropagationContextFromSpan } from './propagator';
import { getSamplingDecision } from './utils/getSamplingDecision';
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

    const parentSpan = trace.getSpan(context);
    const parentContext = parentSpan?.spanContext();

    if (!hasTracingEnabled(options)) {
      return sentrySamplerNoDecision({ context, spanAttributes });
    }

    // If we have a http.client span that has no local parent, we never want to sample it
    // but we want to leave downstream sampling decisions up to the server
    if (
      spanKind === SpanKind.CLIENT &&
      spanAttributes[SEMATTRS_HTTP_METHOD] &&
      (!parentSpan || parentContext?.isRemote)
    ) {
      return sentrySamplerNoDecision({ context, spanAttributes });
    }

    const parentSampled = parentSpan ? getParentSampled(parentSpan, traceId, spanName) : undefined;

    const mutableSamplingDecision = { decision: true };
    this._client.emit(
      'beforeSampling',
      {
        spanAttributes: spanAttributes,
        spanName: spanName,
        parentSampled: parentSampled,
        parentContext: parentContext,
      },
      mutableSamplingDecision,
    );
    if (!mutableSamplingDecision.decision) {
      return sentrySamplerNoDecision({ context, spanAttributes });
    }

    const [sampled, sampleRate] = sampleSpan(options, {
      name: spanName,
      attributes: spanAttributes,
      transactionContext: {
        name: spanName,
        parentSampled,
      },
      parentSampled,
    });

    const attributes: Attributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate,
    };

    const method = `${spanAttributes[SEMATTRS_HTTP_METHOD]}`.toUpperCase();
    if (method === 'OPTIONS' || method === 'HEAD') {
      DEBUG_BUILD && logger.log(`[Tracing] Not sampling span because HTTP method is '${method}' for ${spanName}`);

      return {
        ...sentrySamplerNotSampled({ context, spanAttributes }),
        attributes,
      };
    }

    if (!sampled) {
      return {
        ...sentrySamplerNotSampled({ context, spanAttributes }),
        attributes,
      };
    }
    return {
      ...sentrySamplerSampled({ context, spanAttributes }),
      attributes,
    };
  }

  /** Returns the sampler name or short description with the configuration. */
  public toString(): string {
    return 'SentrySampler';
  }
}

function getParentRemoteSampled(parentSpan: Span): boolean | undefined {
  const traceId = parentSpan.spanContext().traceId;
  const traceparentData = getPropagationContextFromSpan(parentSpan);

  // Only inherit sampled if `traceId` is the same
  return traceparentData && traceId === traceparentData.traceId ? traceparentData.sampled : undefined;
}

function getParentSampled(parentSpan: Span, traceId: string, spanName: string): boolean | undefined {
  const parentContext = parentSpan.spanContext();

  // Only inherit sample rate if `traceId` is the same
  // Note for testing: `isSpanContextValid()` checks the format of the traceId/spanId, so we need to pass valid ones
  if (isSpanContextValid(parentContext) && parentContext.traceId === traceId) {
    if (parentContext.isRemote) {
      const parentSampled = getParentRemoteSampled(parentSpan);
      DEBUG_BUILD &&
        logger.log(`[Tracing] Inheriting remote parent's sampled decision for ${spanName}: ${parentSampled}`);
      return parentSampled;
    }

    const parentSampled = getSamplingDecision(parentContext);
    DEBUG_BUILD && logger.log(`[Tracing] Inheriting parent's sampled decision for ${spanName}: ${parentSampled}`);
    return parentSampled;
  }

  return undefined;
}

/**
 * Returns a SamplingResult that indicates that a span was not sampled, but no definite decision was made yet.
 * This indicates to downstream SDKs that they may make their own decision.
 */
export function sentrySamplerNoDecision({
  context,
  spanAttributes,
}: { context: Context; spanAttributes: SpanAttributes }): SamplingResult {
  const traceState = getBaseTraceState(context, spanAttributes);

  return { decision: SamplingDecision.NOT_RECORD, traceState };
}

/**
 * Returns a SamplingResult that indicates that a span was not sampled.
 */
export function sentrySamplerNotSampled({
  context,
  spanAttributes,
}: { context: Context; spanAttributes: SpanAttributes }): SamplingResult {
  const traceState = getBaseTraceState(context, spanAttributes).set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1');

  return { decision: SamplingDecision.NOT_RECORD, traceState };
}

/**
 * Returns a SamplingResult that indicates that a span was sampled.
 */
export function sentrySamplerSampled({
  context,
  spanAttributes,
}: { context: Context; spanAttributes: SpanAttributes }): SamplingResult {
  const traceState = getBaseTraceState(context, spanAttributes);

  return { decision: SamplingDecision.RECORD_AND_SAMPLED, traceState };
}

function getBaseTraceState(context: Context, spanAttributes: SpanAttributes): TraceStateInterface {
  const parentSpan = trace.getSpan(context);
  const parentContext = parentSpan?.spanContext();

  let traceState = parentContext?.traceState || new TraceState();

  // We always keep the URL on the trace state, so we can access it in the propagator
  const url = spanAttributes[SEMATTRS_HTTP_URL];
  if (url && typeof url === 'string') {
    traceState = traceState.set(SENTRY_TRACE_STATE_URL, url);
  }

  return traceState;
}
