import { DEBUG_BUILD } from '../debug-build';
import type { CoreOptions } from '../types/options';
import type { SamplingContext } from '../types/samplingcontext';
import { debug } from '../utils/debug-logger';
import { hasSpansEnabled } from '../utils/hasSpansEnabled';
import { parseSampleRate } from '../utils/parseSampleRate';
import { safeCallback } from '../utils/safeCallback';

/**
 * Makes a sampling decision for the given options.
 *
 * Called every time a root span is created. Only root spans which emerge with a `sampled` value of `true` will be
 * sent to Sentry.
 */
export function sampleSpan(
  options: Pick<CoreOptions, 'tracesSampleRate' | 'tracesSampler'>,
  samplingContext: SamplingContext,
  sampleRand: number,
): [sampled: boolean, sampleRate?: number, localSampleRateWasApplied?: boolean] {
  // nothing to do if span recording is not enabled
  if (!hasSpansEnabled(options)) {
    return [false];
  }

  const resolved = resolveSampleRate(options, samplingContext);
  if (!resolved) {
    return [false];
  }
  const [sampleRate, localSampleRateWasApplied] = resolved;

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get.
  // (The only valid values are booleans or numbers between 0 and 1.)
  const parsedSampleRate = parseSampleRate(sampleRate);

  if (parsedSampleRate === undefined) {
    DEBUG_BUILD &&
      debug.warn(
        `[Tracing] Discarding root span because of invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          sampleRate,
        )} of type ${JSON.stringify(typeof sampleRate)}.`,
      );
    return [false];
  }

  // if the function returned 0 (or false), or if `tracesSampleRate` is 0, it's a sign the transaction should be dropped
  if (!parsedSampleRate) {
    DEBUG_BUILD &&
      debug.log(
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
      debug.log(
        `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
          sampleRate,
        )})`,
      );
  }

  return [shouldSample, parsedSampleRate, localSampleRateWasApplied];
}

/**
 * Prefers `tracesSampler`. If it throws, falls back to the parent decision, then `tracesSampleRate`.
 * Returns `undefined` when there is nothing to fall back to.
 */
function resolveSampleRate(
  options: Pick<CoreOptions, 'tracesSampleRate' | 'tracesSampler'>,
  samplingContext: SamplingContext,
): [sampleRate: unknown, localSampleRateWasApplied?: boolean] | undefined {
  const { tracesSampler, tracesSampleRate } = options;

  if (typeof tracesSampler === 'function') {
    const samplerResult = safeCallback(
      DEBUG_BUILD
        ? 'The `tracesSampler` callback threw an error, falling back to the parent sampling decision or `tracesSampleRate`:'
        : '',
      (): [unknown, boolean] => [
        tracesSampler({
          ...samplingContext,
          inheritOrSampleWith: fallbackSampleRate => {
            // If we have an incoming parent sample rate, we'll just use that one.
            // The sampling decision will be inherited because of the sample_rand that was generated when the trace reached the incoming boundaries of the SDK.
            if (typeof samplingContext.parentSampleRate === 'number') {
              return samplingContext.parentSampleRate;
            }

            // Fallback if parent sample rate is not on the incoming trace (e.g. if there is no baggage)
            // This is to provide backwards compatibility if there are incoming traces from older SDKs that don't send a parent sample rate or a sample rand. In these cases we just want to force either a sampling decision on the downstream traces via the sample rate.
            if (typeof samplingContext.parentSampled === 'boolean') {
              return Number(samplingContext.parentSampled);
            }

            return fallbackSampleRate;
          },
        }),
        true,
      ],
      () => undefined,
    );
    if (samplerResult) {
      return samplerResult;
    }
  }

  if (samplingContext.parentSampled !== undefined) {
    return [samplingContext.parentSampled];
  }

  if (typeof tracesSampleRate !== 'undefined') {
    return [tracesSampleRate, true];
  }

  return undefined;
}
