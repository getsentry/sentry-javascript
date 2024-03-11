import { spanIsSampled, spanToJSON } from '@sentry/core';
import type { NodeClient } from '@sentry/node-experimental';
import type { CustomSamplingContext, Span } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import { CpuProfilerBindings } from './cpu_profiler';
import { DEBUG_BUILD } from './debug-build';
import { isValidSampleRate } from './utils';

export const MAX_PROFILE_DURATION_MS = 30 * 1000;

/**
 * Takes a transaction and determines if it should be profiled or not. If it should be profiled, it returns the
 * profile_id, otherwise returns undefined. Takes care of setting profile context on transaction as well
 */
export function maybeProfileSpan(
  client: NodeClient | undefined,
  span: Span,
  customSamplingContext?: CustomSamplingContext,
): string | undefined {
  // profilesSampleRate is multiplied with tracesSampleRate to get the final sampling rate. We dont perform
  // the actual multiplication to get the final rate, but we discard the profile if the span was sampled,
  // so anything after this block from here is based on the span sampling.
  if (!spanIsSampled(span)) {
    return;
  }

  // Client and options are required for profiling
  if (!client) {
    DEBUG_BUILD && logger.log('[Profiling] Profiling disabled, no client found.');
    return;
  }

  const options = client.getOptions();
  if (!options) {
    DEBUG_BUILD && logger.log('[Profiling] Profiling disabled, no options found.');
    return;
  }

  const profilesSampler = options.profilesSampler;
  let profilesSampleRate: number | boolean | undefined = options.profilesSampleRate;

  // Prefer sampler to sample rate if both are provided.
  if (typeof profilesSampler === 'function') {
    const { description: spanName = '<unknown>', data } = spanToJSON(span);
    // We bail out early if that is not the case
    const parentSampled = true;

    profilesSampleRate = profilesSampler({
      name: spanName,
      attributes: data,
      transactionContext: {
        name: spanName,
        parentSampled,
      },
      parentSampled,
      ...customSamplingContext,
    });
  }

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
  // only valid values are booleans or numbers between 0 and 1.)
  if (!isValidSampleRate(profilesSampleRate)) {
    DEBUG_BUILD && logger.warn('[Profiling] Discarding profile because of invalid sample rate.');
    return;
  }

  // if the function returned 0 (or false), or if `profileSampleRate` is 0, it's a sign the profile should be dropped
  if (!profilesSampleRate) {
    DEBUG_BUILD &&
      logger.log(
        `[Profiling] Discarding profile because ${
          typeof profilesSampler === 'function'
            ? 'profileSampler returned 0 or false'
            : 'a negative sampling decision was inherited or profileSampleRate is set to 0'
        }`,
      );
    return;
  }

  // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
  // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
  const sampled = profilesSampleRate === true ? true : Math.random() < profilesSampleRate;
  // Check if we should sample this profile
  if (!sampled) {
    DEBUG_BUILD &&
      logger.log(
        `[Profiling] Discarding profile because it's not included in the random sample (sampling rate = ${Number(
          profilesSampleRate,
        )})`,
      );
    return;
  }

  const profile_id = uuid4();
  CpuProfilerBindings.startProfiling(profile_id);
  DEBUG_BUILD && logger.log(`[Profiling] started profiling transaction: ${spanToJSON(span).description}`);

  // set transaction context - do this regardless if profiling fails down the line
  // so that we can still see the profile_id in the transaction context
  return profile_id;
}

/**
 * Stops the profiler for profile_id and returns the profile
 * @param transaction
 * @param profile_id
 * @returns
 */
export function stopSpanProfile(
  span: Span,
  profile_id: string | undefined,
): ReturnType<(typeof CpuProfilerBindings)['stopProfiling']> | null {
  // Should not happen, but satisfy the type checker and be safe regardless.
  if (!profile_id) {
    return null;
  }

  const profile = CpuProfilerBindings.stopProfiling(profile_id);

  DEBUG_BUILD && logger.log(`[Profiling] stopped profiling of transaction: ${spanToJSON(span).description}`);

  // In case of an overlapping span, stopProfiling may return null and silently ignore the overlapping profile.
  if (!profile) {
    DEBUG_BUILD &&
      logger.log(
        `[Profiling] profiler returned null profile for: ${spanToJSON(span).description}`,
        'this may indicate an overlapping span or a call to stopProfiling with a profile title that was never started',
      );
    return null;
  }

  // Assign profile_id to the profile
  profile.profile_id = profile_id;
  return profile;
}
