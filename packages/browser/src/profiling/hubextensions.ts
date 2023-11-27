/* eslint-disable complexity */
import type { Transaction } from '@sentry/types';
import { logger, timestampInSeconds, uuid4 } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import type { JSSelfProfile } from './jsSelfProfiling';
import {
  addProfileToGlobalCache,
  isAutomatedPageLoadTransaction,
  MAX_PROFILE_DURATION_MS,
  shouldProfileTransaction,
  startJSSelfProfile,
} from './utils';

/**
 * Safety wrapper for startTransaction for the unlikely case that transaction starts before tracing is imported -
 * if that happens we want to avoid throwing an error from profiling code.
 * see https://github.com/getsentry/sentry-javascript/issues/4731.
 *
 * @experimental
 */
export function onProfilingStartRouteTransaction(transaction: Transaction | undefined): Transaction | undefined {
  if (!transaction) {
    if (DEBUG_BUILD) {
      logger.log('[Profiling] Transaction is undefined, skipping profiling');
    }
    return transaction;
  }

  if (shouldProfileTransaction(transaction)) {
    return startProfileForTransaction(transaction);
  }

  return transaction;
}

/**
 * Wraps startTransaction and stopTransaction with profiling related logic.
 * startProfileForTransaction is called after the call to startTransaction in order to avoid our own code from
 * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
 */
export function startProfileForTransaction(transaction: Transaction): Transaction {
  // Start the profiler and get the profiler instance.
  let startTimestamp: number | undefined;
  if (isAutomatedPageLoadTransaction(transaction)) {
    startTimestamp = timestampInSeconds() * 1000;
  }

  const profiler = startJSSelfProfile();

  // We failed to construct the profiler, fallback to original transaction.
  // No need to log anything as this has already been logged in startProfile.
  if (!profiler) {
    return transaction;
  }

  if (DEBUG_BUILD) {
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
      if (DEBUG_BUILD) {
        logger.log(
          '[Profiling] profile for:',
          transaction.name || transaction.description,
          'already exists, returning early',
        );
      }
      return null;
    }

    return profiler
      .stop()
      .then((profile: JSSelfProfile): null => {
        if (maxDurationTimeoutID) {
          WINDOW.clearTimeout(maxDurationTimeoutID);
          maxDurationTimeoutID = undefined;
        }

        if (DEBUG_BUILD) {
          logger.log(`[Profiling] stopped profiling of transaction: ${transaction.name || transaction.description}`);
        }

        // In case of an overlapping transaction, stopProfiling may return null and silently ignore the overlapping profile.
        if (!profile) {
          if (DEBUG_BUILD) {
            logger.log(
              `[Profiling] profiler returned null profile for: ${transaction.name || transaction.description}`,
              'this may indicate an overlapping transaction or a call to stopProfiling with a profile title that was never started',
            );
          }
          return null;
        }

        addProfileToGlobalCache(profileId, profile);
        return null;
      })
      .catch(error => {
        if (DEBUG_BUILD) {
          logger.log('[Profiling] error while stopping profiler:', error);
        }
        return null;
      });
  }

  // Enqueue a timeout to prevent profiles from running over max duration.
  let maxDurationTimeoutID: number | undefined = WINDOW.setTimeout(() => {
    if (DEBUG_BUILD) {
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
        transaction.setContext('profile', { profile_id: profileId, start_timestamp: startTimestamp });
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
