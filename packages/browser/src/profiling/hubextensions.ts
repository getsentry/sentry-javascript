/* eslint-disable complexity */
import { getCurrentHub } from '@sentry/core';
import type { Transaction } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import { WINDOW } from '../helpers';
import type { JSSelfProfile, JSSelfProfiler, JSSelfProfilerConstructor } from './jsSelfProfiling';
import { addProfileToMap, isValidSampleRate } from './utils';

export const MAX_PROFILE_DURATION_MS = 30_000;
// Keep a flag value to avoid re-initializing the profiler constructor. If it fails
// once, it will always fail and this allows us to early return.
let PROFILING_CONSTRUCTOR_FAILED = false;

/**
 * Check if profiler constructor is available.
 * @param maybeProfiler
 */
function isJSProfilerSupported(maybeProfiler: unknown): maybeProfiler is typeof JSSelfProfilerConstructor {
  return typeof maybeProfiler === 'function';
}

/**
 * Safety wrapper for startTransaction for the unlikely case that transaction starts before tracing is imported -
 * if that happens we want to avoid throwing an error from profiling code.
 * see https://github.com/getsentry/sentry-javascript/issues/4731.
 *
 * @experimental
 */
export function onProfilingStartRouteTransaction(transaction: Transaction | undefined): Transaction | undefined {
  if (!transaction) {
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Transaction is undefined, skipping profiling');
    }
    return transaction;
  }

  return wrapTransactionWithProfiling(transaction);
}

/**
 * Wraps startTransaction and stopTransaction with profiling related logic.
 * startProfiling is called after the call to startTransaction in order to avoid our own code from
 * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
 */
export function wrapTransactionWithProfiling(transaction: Transaction): Transaction {
  // Feature support check first
  const JSProfilerConstructor = WINDOW.Profiler;

  if (!isJSProfilerSupported(JSProfilerConstructor)) {
    if (__DEBUG_BUILD__) {
      logger.log(
        '[Profiling] Profiling is not supported by this browser, Profiler interface missing on window object.',
      );
    }
    return transaction;
  }

  // If constructor failed once, it will always fail, so we can early return.
  if (PROFILING_CONSTRUCTOR_FAILED) {
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Profiling has been disabled for the duration of the current user session.');
    }
    return transaction;
  }

  const client = getCurrentHub().getClient();
  const options = client && client.getOptions();
  if (!options) {
    __DEBUG_BUILD__ && logger.log('[Profiling] Profiling disabled, no options found.');
    return transaction;
  }

  // @ts-ignore profilesSampleRate is not part of the browser options yet
  const profilesSampleRate: number | boolean | undefined = options.profilesSampleRate;

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
  // only valid values are booleans or numbers between 0 and 1.)
  if (!isValidSampleRate(profilesSampleRate)) {
    __DEBUG_BUILD__ && logger.warn('[Profiling] Discarding profile because of invalid sample rate.');
    return transaction;
  }

  // if the function returned 0 (or false), or if `profileSampleRate` is 0, it's a sign the profile should be dropped
  if (!profilesSampleRate) {
    __DEBUG_BUILD__ &&
      logger.log(
        '[Profiling] Discarding profile because a negative sampling decision was inherited or profileSampleRate is set to 0',
      );
    return transaction;
  }

  // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
  // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
  const sampled = profilesSampleRate === true ? true : Math.random() < profilesSampleRate;
  // Check if we should sample this profile
  if (!sampled) {
    __DEBUG_BUILD__ &&
      logger.log(
        `[Profiling] Discarding profile because it's not included in the random sample (sampling rate = ${Number(
          profilesSampleRate,
        )})`,
      );
    return transaction;
  }

  // From initial testing, it seems that the minimum value for sampleInterval is 10ms.
  const samplingIntervalMS = 10;
  // Start the profiler
  const maxSamples = Math.floor(MAX_PROFILE_DURATION_MS / samplingIntervalMS);
  let profiler: JSSelfProfiler | undefined;

  // Attempt to initialize the profiler constructor, if it fails, we disable profiling for the current user session.
  // This is likely due to a missing 'Document-Policy': 'js-profiling' header. We do not want to throw an error if this happens
  // as we risk breaking the user's application, so just disable profiling and log an error.
  try {
    profiler = new JSProfilerConstructor({ sampleInterval: samplingIntervalMS, maxBufferSize: maxSamples });
  } catch (e) {
    if (__DEBUG_BUILD__) {
      logger.log(
        "[Profiling] Failed to initialize the Profiling constructor, this is likely due to a missing 'Document-Policy': 'js-profiling' header.",
      );
      logger.log('[Profiling] Disabling profiling for current user session.');
    }
    PROFILING_CONSTRUCTOR_FAILED = true;
  }

  // We failed to construct the profiler, fallback to original transaction - there is no need to log
  // anything as we already did that in the try/catch block.
  if (!profiler) {
    return transaction;
  }

  if (__DEBUG_BUILD__) {
    logger.log(`[Profiling] started profiling transaction: ${transaction.name || transaction.description}`);
  }

  // We create "unique" transaction names to avoid concurrent transactions with same names
  // from being ignored by the profiler. From here on, only this transaction name should be used when
  // calling the profiler methods. Note: we log the original name to the user to avoid confusion.
  const profileId = uuid4();

  // A couple of important things to note here:
  // `CpuProfilerBindings.stopProfiling` will be scheduled to run in 30seconds in order to exceed max profile duration.
  // Whichever of the two (transaction.finish/timeout) is first to run, the profiling will be stopped and the gathered profile
  // will be processed when the original transaction is finished. Since onProfileHandler can be invoked multiple times in the
  // event of an error or user mistake (calling transaction.finish multiple times), it is important that the behavior of onProfileHandler
  // is idempotent as we do not want any timings or profiles to be overriden by the last call to onProfileHandler.
  // After the original finish method is called, the event will be reported through the integration and delegated to transport.
  const processedProfile: JSSelfProfile | null = null;

  /**
   * Idempotent handler for profile stop
   */
  async function onProfileHandler(): Promise<null> {
    // Check if the profile exists and return it the behavior has to be idempotent as users may call transaction.finish multiple times.
    if (!transaction) {
      return null;
    }
    // Satisfy the type checker, but profiler will always be defined here.
    if (!profiler) {
      return null;
    }
    if (processedProfile) {
      if (__DEBUG_BUILD__) {
        logger.log(
          '[Profiling] profile for:',
          transaction.name || transaction.description,
          'already exists, returning early',
        );
      }
      return null;
    }

    // This is temporary - we will use the collected span data to evaluate
    // if deferring txn.finish until profiler resolves is a viable approach.
    const stopProfilerSpan = transaction.startChild({
      description: 'profiler.stop',
      op: 'profiler',
      origin: 'auto.profiler.browser',
    });

    return profiler
      .stop()
      .then((p: JSSelfProfile): null => {
        stopProfilerSpan.finish();

        if (maxDurationTimeoutID) {
          WINDOW.clearTimeout(maxDurationTimeoutID);
          maxDurationTimeoutID = undefined;
        }

        if (__DEBUG_BUILD__) {
          logger.log(`[Profiling] stopped profiling of transaction: ${transaction.name || transaction.description}`);
        }

        // In case of an overlapping transaction, stopProfiling may return null and silently ignore the overlapping profile.
        if (!p) {
          if (__DEBUG_BUILD__) {
            logger.log(
              `[Profiling] profiler returned null profile for: ${transaction.name || transaction.description}`,
              'this may indicate an overlapping transaction or a call to stopProfiling with a profile title that was never started',
            );
          }
          return null;
        }

        addProfileToMap(profileId, p);
        return null;
      })
      .catch(error => {
        stopProfilerSpan.finish();
        if (__DEBUG_BUILD__) {
          logger.log('[Profiling] error while stopping profiler:', error);
        }
        return null;
      });
  }

  // Enqueue a timeout to prevent profiles from running over max duration.
  let maxDurationTimeoutID: number | undefined = WINDOW.setTimeout(() => {
    if (__DEBUG_BUILD__) {
      logger.log(
        '[Profiling] max profile duration elapsed, stopping profiling for:',
        transaction.name || transaction.description,
      );
    }
    // If the timeout exceeds, we want to stop profiling, but not finish the transaction
    void onProfileHandler();
  }, MAX_PROFILE_DURATION_MS);

  // We need to reference the original finish call to avoid creating an infinite loop
  const originalFinish = transaction.finish.bind(transaction);

  /**
   * Wraps startTransaction and stopTransaction with profiling related logic.
   * startProfiling is called after the call to startTransaction in order to avoid our own code from
   * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
   */
  function profilingWrappedTransactionFinish(): Transaction {
    if (!transaction) {
      return originalFinish();
    }
    // onProfileHandler should always return the same profile even if this is called multiple times.
    // Always call onProfileHandler to ensure stopProfiling is called and the timeout is cleared.
    void onProfileHandler().then(
      () => {
        transaction.setContext('profile', { profile_id: profileId });
        originalFinish();
      },
      () => {
        // If onProfileHandler fails, we still want to call the original finish method.
        originalFinish();
      },
    );

    return transaction;
  }

  transaction.finish = profilingWrappedTransactionFinish;
  return transaction;
}
