import type { Attributes, Context, Span } from '@opentelemetry/api';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, hasTracingEnabled, sampleSpan } from '@sentry/core';
import type { Client, SpanAttributes } from '@sentry/types';
import { logger } from '@sentry/utils';
import { SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING } from './constants';

import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
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
    _spanKind: unknown,
    spanAttributes: SpanAttributes,
    _links: unknown,
  ): SamplingResult {
    const options = this._client.getOptions();

    if (!hasTracingEnabled(options)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    const parentSpan = trace.getSpan(context);
    const parentContext = parentSpan?.spanContext();
    const traceState = parentContext?.traceState || new TraceState();

    let parentSampled: boolean | undefined = undefined;

    // Only inherit sample rate if `traceId` is the same
    // Note for testing: `isSpanContextValid()` checks the format of the traceId/spanId, so we need to pass valid ones
    if (parentSpan && parentContext && isSpanContextValid(parentContext) && parentContext.traceId === traceId) {
      if (parentContext.isRemote) {
        parentSampled = getParentRemoteSampled(parentSpan);
        DEBUG_BUILD &&
          logger.log(`[Tracing] Inheriting remote parent's sampled decision for ${spanName}: ${parentSampled}`);
      } else {
        parentSampled = getSamplingDecision(parentContext);
        DEBUG_BUILD && logger.log(`[Tracing] Inheriting parent's sampled decision for ${spanName}: ${parentSampled}`);
      }
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

    const method = `${spanAttributes[SemanticAttributes.HTTP_METHOD]}`.toUpperCase();
    if (method === 'OPTIONS' || method === 'HEAD') {
      DEBUG_BUILD && logger.log(`[Tracing] Not sampling span because HTTP method is '${method}' for ${spanName}`);
      return {
        decision: SamplingDecision.NOT_RECORD,
        attributes,
        traceState: traceState.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
      };
    }

    if (!sampled) {
      return {
        decision: SamplingDecision.NOT_RECORD,
        attributes,
        traceState: traceState.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
      };
    }

    return {
      decision: SamplingDecision.RECORD_AND_SAMPLED,
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
