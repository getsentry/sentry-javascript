import type { Options, SamplingContext } from '../types-hoist';

import { DEBUG_BUILD } from '../debug-build';
import { logger } from '../utils-hoist/logger';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { parseSampleRate } from '../utils/parseSampleRate';

/**
 * Makes a sampling decision for the given options.
 *
 * Called every time a root span is created. Only root spans which emerge with a `sampled` value of `true` will be
 * sent to Sentry.
 */
export function sampleSpan(
  options: Pick<Options, 'tracesSampleRate' | 'tracesSampler'>,
  samplingContext: SamplingContext,
  sampleRand: number,
): [sampled: boolean, sampleRate?: number, localSampleRateWasApplied?: boolean] {
  // nothing to do if tracing is not enabled
  if (!hasTracingEnabled(options)) {
    return [false];
  }

  let localSampleRateWasApplied = undefined;

  // we would have bailed already if neither `tracesSampler` nor `tracesSampleRate` were defined, so one of these should
  // work; prefer the hook if so
  let sampleRate;
  if (typeof options.tracesSampler === 'function') {
    sampleRate = options.tracesSampler(samplingContext);
    localSampleRateWasApplied = true;
  } else if (samplingContext.parentSampled !== undefined) {
    sampleRate = samplingContext.parentSampled;
  } else if (typeof options.tracesSampleRate !== 'undefined') {
    sampleRate = options.tracesSampleRate;
    localSampleRateWasApplied = true;
  }

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get.
  // (The only valid values are booleans or numbers between 0 and 1.)
  const parsedSampleRate = parseSampleRate(sampleRate);

  if (parsedSampleRate === undefined) {
    DEBUG_BUILD &&
      logger.warn(
        `[Tracing] Discarding root span because of invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          sampleRate,
        )} of type ${JSON.stringify(typeof sampleRate)}.`,
      );
    return [false];
  }

  // if the function returned 0 (or false), or if `tracesSampleRate` is 0, it's a sign the transaction should be dropped
  if (!parsedSampleRate) {
    DEBUG_BUILD &&
      logger.log(
        `[Tracing] Discarding transaction because ${
          typeof options.tracesSampler === 'function'
            ? 'tracesSampler returned 0 or false'
            : 'a negative sampling decision was inherited or tracesSampleRate is set to 0'
        }`,
      );
    return [false, parsedSampleRate, localSampleRateWasApplied];
  }

  // We always compare the sample rand for the current execution context against the chosen sample rate.
  // Read more: https://develop.sentry.dev/sdk/telemetry/traces/#propagated-random-value
  const shouldSample = sampleRand < parsedSampleRate;

  // if we're not going to keep it, we're done
  if (!shouldSample) {
    DEBUG_BUILD &&
      logger.log(
        `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
          sampleRate,
        )})`,
      );
  }

  return [shouldSample, parsedSampleRate, localSampleRateWasApplied];
}
