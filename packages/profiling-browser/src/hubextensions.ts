import { WINDOW } from '@sentry/browser';
import { getMainCarrier } from '@sentry/core';
import type { CustomSamplingContext, Hub, Transaction, TransactionContext } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import { sendProfile } from './integration';
import type { JSSelfProfile, JSSelfProfiler, ProcessedJSSelfProfile } from './jsSelfProfiling';

const MAX_PROFILE_DURATION_MS = 30_000;

// While we experiment, per transaction sampling interval will be more flexible to work with.

type StartTransaction = (
  this: Hub,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
) => Transaction;

function isJSProfilerSupported(maybeProfiler: unknown): maybeProfiler is typeof JSSelfProfiler {
  return typeof maybeProfiler === 'function';
}

/**
 * Wraps startTransaction and stopTransaction with profiling related logic.
 * startProfiling is called after the call to startTransaction in order to avoid our own code from
 * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
 */
export function wrapStartTransactionWithProfiling(startTransaction: StartTransaction): StartTransaction {
  return function wrappedStartTransaction(
    this: Hub,
    transactionContext: TransactionContext,
    customSamplingContext?: CustomSamplingContext,
  ): Transaction {
    const transaction: Transaction = startTransaction.call(this, transactionContext, customSamplingContext);

    // We create "unique" transaction names to avoid concurrent transactions with same names
    // from being ignored by the profiler. From here on, only this transaction name should be used when
    // calling the profiler methods. Note: we log the original name to the user to avoid confusion.
    const profile_id = uuid4();

    // profilesSampleRate is multiplied with tracesSampleRate to get the final sampling rate.
    if (!transaction.sampled) {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Transaction is not sampled, skipping profiling');
      }
      return transaction;
    }

    const client = this.getClient();
    const options = client && client.getOptions();

    const JSProfiler = WINDOW.Profiler;

    // Feature support check
    if (!isJSProfilerSupported(JSProfiler)) {
      if (__DEBUG_BUILD__) {
        logger.log(
          '[Profiling] Profiling is not supported by this browser, Profiler interface missing on window object.',
        );
      }
      return transaction;
    }

    // @ts-ignore not part of the browser options yet
    const profilesSampleRate = (options && options.profilesSampleRate) || 0;
    if (profilesSampleRate === undefined) {
      if (__DEBUG_BUILD__) {
        logger.log(
          '[Profiling] Profiling disabled, enable it by setting `profilesSampleRate` option to SDK init call.',
        );
      }
      return transaction;
    }

    // Check if we should sample this profile
    if (Math.random() > profilesSampleRate) {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Skip profiling transaction due to sampling.');
      }
      return transaction;
    }

    // Defer any profilesSamplingInterval validation to the profiler API
    // @ts-ignore not part of the browser options yet and might never be, but useful to control during poc stage
    const samplingInterval = options.profilesSamplingInterval || 10;
    // Start the profiler
    const maxSamples = Math.floor(MAX_PROFILE_DURATION_MS / samplingInterval);
    const profiler = new JSProfiler({ sampleInterval: samplingInterval, maxBufferSize: maxSamples });
    if (__DEBUG_BUILD__) {
      logger.log(`[Profiling] started profiling transaction: ${transactionContext.name}`);
    }

    // A couple of important things to note here:
    // `CpuProfilerBindings.stopProfiling` will be scheduled to run in 30seconds in order to exceed max profile duration.
    // Whichever of the two (transaction.finish/timeout) is first to run, the profiling will be stopped and the gathered profile
    // will be processed when the original transaction is finished. Since onProfileHandler can be invoked multiple times in the
    // event of an error or user mistake (calling transaction.finish multiple times), it is important that the behavior of onProfileHandler
    // is idempotent as we do not want any timings or profiles to be overriden by the last call to onProfileHandler.
    // After the original finish method is called, the event will be reported through the integration and delegated to transport.
    let processedProfile: ProcessedJSSelfProfile | null = null;

    /**
     *
     */
    function onProfileHandler(): void {
      // Check if the profile exists and return it the behavior has to be idempotent as users may call transaction.finish multiple times.
      if (processedProfile) {
        if (__DEBUG_BUILD__) {
          logger.log('[Profiling] profile for:', transactionContext.name, 'already exists, returning early');
        }
        return;
      }

      profiler
        .stop()
        .then((p: JSSelfProfile): void => {
          if (maxDurationTimeoutID) {
            WINDOW.clearTimeout(maxDurationTimeoutID);
            maxDurationTimeoutID = undefined;
          }

          if (__DEBUG_BUILD__) {
            logger.log(`[Profiling] stopped profiling of transaction: ${transactionContext.name}`);
          }

          // In case of an overlapping transaction, stopProfiling may return null and silently ignore the overlapping profile.
          if (!p) {
            if (__DEBUG_BUILD__) {
              logger.log(
                `[Profiling] profiler returned null profile for: ${transactionContext.name}`,
                'this may indicate an overlapping transaction or a call to stopProfiling with a profile title that was never started',
              );
            }
            return;
          }

          processedProfile = { ...p, profile_id: profile_id };
          sendProfile(profile_id, processedProfile);
        })
        .catch(error => {
          if (__DEBUG_BUILD__) {
            logger.log('[Profiling] error while stopping profiler:', error);
          }
          return null;
        });
    }

    // Enqueue a timeout to prevent profiles from running over max duration.
    let maxDurationTimeoutID: number | undefined = WINDOW.setTimeout(() => {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] max profile duration elapsed, stopping profiling for:', transactionContext.name);
      }
      void onProfileHandler();
    }, MAX_PROFILE_DURATION_MS);

    // We need to reference the original finish call to avoid creating an infinite loop
    const originalFinish = transaction.finish.bind(transaction);

    /**
     *
     */
    function profilingWrappedTransactionFinish(): Promise<Transaction> {
      // onProfileHandler should always return the same profile even if this is called multiple times.
      // Always call onProfileHandler to ensure stopProfiling is called and the timeout is cleared.
      // Set profile context
      onProfileHandler();
      transaction.setContext('profile', { profile_id });

      return originalFinish();
    }

    transaction.finish = profilingWrappedTransactionFinish;
    return transaction;
  };
}

/**
 * Patches startTransaction and stopTransaction with profiling logic.
 * @private
 */
function _addProfilingExtensionMethods(): void {
  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    if (__DEBUG_BUILD__) {
      logger.log("[Profiling] Can't find main carrier, profiling won't work.");
    }
    return;
  }
  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};

  if (!carrier.__SENTRY__.extensions['startTransaction']) {
    if (__DEBUG_BUILD__) {
      logger.log(
        '[Profiling] startTransaction does not exists, profiling will not work. Make sure you import @sentry/tracing package before @sentry/profiling-node as import order matters.',
      );
    }
    return;
  }

  if (__DEBUG_BUILD__) {
    logger.log('[Profiling] startTransaction exists, patching it with profiling functionality...');
  }
  carrier.__SENTRY__.extensions['startTransaction'] = wrapStartTransactionWithProfiling(
    // This is already patched by sentry/tracing, we are going to re-patch it...
    carrier.__SENTRY__.extensions['startTransaction'] as StartTransaction,
  );
}

/**
 * This patches the global object and injects the Profiling extensions methods
 */
export function addExtensionMethods(): void {
  _addProfilingExtensionMethods();
}
