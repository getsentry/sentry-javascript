import type { Attributes, Context, SpanContext } from '@opentelemetry/api';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, hasTracingEnabled } from '@sentry/core';
import type { Client, ClientOptions, SamplingContext } from '@sentry/types';
import { isNaN, logger } from '@sentry/utils';
import { SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING } from './constants';

import { DEBUG_BUILD } from './debug-build';
import { getPropagationContextFromSpanContext, getSamplingDecision } from './propagator';
import { setIsSetup } from './utils/setupCheck';

/**
 * A custom OTEL sampler that uses Sentry sampling rates to make it's decision
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
    spanAttributes: unknown,
    _links: unknown,
  ): SamplingResult {
    const options = this._client.getOptions();

    if (!hasTracingEnabled(options)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    const parentContext = trace.getSpanContext(context);
    const traceState = parentContext?.traceState || new TraceState();

    let parentSampled: boolean | undefined = undefined;

    // Only inherit sample rate if `traceId` is the same
    // Note for testing: `isSpanContextValid()` checks the format of the traceId/spanId, so we need to pass valid ones
    if (parentContext && isSpanContextValid(parentContext) && parentContext.traceId === traceId) {
      if (parentContext.isRemote) {
        parentSampled = getParentRemoteSampled(parentContext);
        DEBUG_BUILD &&
          logger.log(`[Tracing] Inheriting remote parent's sampled decision for ${spanName}: ${parentSampled}`);
      } else {
        parentSampled = getSamplingDecision(parentContext);
        DEBUG_BUILD && logger.log(`[Tracing] Inheriting parent's sampled decision for ${spanName}: ${parentSampled}`);
      }
    }

    const sampleRate = getSampleRate(options, {
      name: spanName,
      attributes: spanAttributes,
      transactionContext: {
        name: spanName,
        parentSampled,
      },
      parentSampled,
    });

    const attributes: Attributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: Number(sampleRate),
    };

    // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
    // only valid values are booleans or numbers between 0 and 1.)
    if (!isValidSampleRate(sampleRate)) {
      DEBUG_BUILD && logger.warn('[Tracing] Discarding span because of invalid sample rate.');

      return {
        decision: SamplingDecision.NOT_RECORD,
        attributes,
        traceState: traceState.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
      };
    }

    // if the function returned 0 (or false), or if `tracesSampleRate` is 0, it's a sign the transaction should be dropped
    if (!sampleRate) {
      DEBUG_BUILD &&
        logger.log(
          `[Tracing] Discarding span because ${
            typeof options.tracesSampler === 'function'
              ? 'tracesSampler returned 0 or false'
              : 'a negative sampling decision was inherited or tracesSampleRate is set to 0'
          }`,
        );

      return {
        decision: SamplingDecision.NOT_RECORD,
        attributes,
        traceState: traceState.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
      };
    }

    // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
    // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
    const isSampled = Math.random() < (sampleRate as number | boolean);

    // if we're not going to keep it, we're done
    if (!isSampled) {
      DEBUG_BUILD &&
        logger.log(
          `[Tracing] Discarding span because it's not included in the random sample (sampling rate = ${Number(
            sampleRate,
          )})`,
        );

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

function getSampleRate(
  options: Pick<ClientOptions, 'tracesSampleRate' | 'tracesSampler' | 'enableTracing'>,
  samplingContext: SamplingContext,
): number | boolean {
  if (typeof options.tracesSampler === 'function') {
    return options.tracesSampler(samplingContext);
  }

  if (samplingContext.parentSampled !== undefined) {
    return samplingContext.parentSampled;
  }

  if (typeof options.tracesSampleRate !== 'undefined') {
    return options.tracesSampleRate;
  }

  // When `enableTracing === true`, we use a sample rate of 100%
  if (options.enableTracing) {
    return 1;
  }

  return 0;
}

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 */
function isValidSampleRate(rate: unknown): boolean {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  if (isNaN(rate) || !(typeof rate === 'number' || typeof rate === 'boolean')) {
    DEBUG_BUILD &&
      logger.warn(
        `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          rate,
        )} of type ${JSON.stringify(typeof rate)}.`,
      );
    return false;
  }

  // in case sampleRate is a boolean, it will get automatically cast to 1 if it's true and 0 if it's false
  if (rate < 0 || rate > 1) {
    DEBUG_BUILD &&
      logger.warn(`[Tracing] Given sample rate is invalid. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

function getParentRemoteSampled(spanContext: SpanContext): boolean | undefined {
  const traceId = spanContext.traceId;
  const traceparentData = getPropagationContextFromSpanContext(spanContext);

  // Only inherit sampled if `traceId` is the same
  return traceparentData && traceId === traceparentData.traceId ? traceparentData.sampled : undefined;
}
