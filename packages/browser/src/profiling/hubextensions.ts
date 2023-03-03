import { getCurrentHub, getMainCarrier } from '@sentry/core';
import type { CustomSamplingContext, Hub, Transaction, TransactionContext } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import { WINDOW } from '../helpers';
import type {
  JSSelfProfile,
  JSSelfProfiler,
  JSSelfProfilerConstructor,
  ProcessedJSSelfProfile,
} from './jsSelfProfiling';
import { sendProfile } from './sendProfile';

// Max profile duration.
const MAX_PROFILE_DURATION_MS = 30_000;
// Keep a flag value to avoid re-initializing the profiler constructor. If it fails
// once, it will always fail and this allows us to early return.
let PROFILING_CONSTRUCTOR_FAILED = false;

// While we experiment, per transaction sampling interval will be more flexible to work with.
type StartTransaction = (
  this: Hub,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
) => Transaction | undefined;

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
function wrapTransactionWithProfiling(transaction: Transaction): Transaction {
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

  // profilesSampleRate is multiplied with tracesSampleRate to get the final sampling rate.
  if (!transaction.sampled) {
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Transaction is not sampled, skipping profiling');
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

  // @ts-ignore not part of the browser options yet
  const profilesSampleRate = (options && options.profilesSampleRate) || 0;
  if (profilesSampleRate === undefined) {
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Profiling disabled, enable it by setting `profilesSampleRate` option to SDK init call.');
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
  let processedProfile: ProcessedJSSelfProfile | null = null;

  /**
   * Idempotent handler for profile stop
   */
  function onProfileHandler(): void {
    // Check if the profile exists and return it the behavior has to be idempotent as users may call transaction.finish multiple times.
    if (!transaction) {
      return;
    }
    // Satisfy the type checker, but profiler will always be defined here.
    if (!profiler) {
      return;
    }
    if (processedProfile) {
      if (__DEBUG_BUILD__) {
        logger.log(
          '[Profiling] profile for:',
          transaction.name || transaction.description,
          'already exists, returning early',
        );
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
          return;
        }

        // If a profile has less than 2 samples, it is not useful and should be discarded.
        if (p.samples.length < 2) {
          return;
        }

        processedProfile = { ...p, profile_id: profileId };
        sendProfile(profileId, processedProfile);
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
      logger.log(
        '[Profiling] max profile duration elapsed, stopping profiling for:',
        transaction.name || transaction.description,
      );
    }
    void onProfileHandler();
  }, MAX_PROFILE_DURATION_MS);

  // We need to reference the original finish call to avoid creating an infinite loop
  const originalFinish = transaction.finish.bind(transaction);

  /**
   * Wraps startTransaction and stopTransaction with profiling related logic.
   * startProfiling is called after the call to startTransaction in order to avoid our own code from
   * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
   */
  function profilingWrappedTransactionFinish(): Promise<Transaction> {
    if (!transaction) {
      return originalFinish();
    }
    // onProfileHandler should always return the same profile even if this is called multiple times.
    // Always call onProfileHandler to ensure stopProfiling is called and the timeout is cleared.
    onProfileHandler();

    // Set profile context
    transaction.setContext('profile', { profile_id: profileId });

    return originalFinish();
  }

  transaction.finish = profilingWrappedTransactionFinish;
  return transaction;
}

/**
 * Wraps startTransaction with profiling logic. This is done automatically by the profiling integration.
 */
function __PRIVATE__wrapStartTransactionWithProfiling(startTransaction: StartTransaction): StartTransaction {
  return function wrappedStartTransaction(
    this: Hub,
    transactionContext: TransactionContext,
    customSamplingContext?: CustomSamplingContext,
  ): Transaction | undefined {
    const transaction: Transaction | undefined = startTransaction.call(this, transactionContext, customSamplingContext);
    if (transaction === undefined) {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Transaction is undefined, skipping profiling');
      }
      return transaction;
    }

    return wrapTransactionWithProfiling(transaction);
  };
}

/**
 * Patches startTransaction and stopTransaction with profiling logic.
 */
export function addProfilingExtensionMethods(): void {
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

  carrier.__SENTRY__.extensions['startTransaction'] = __PRIVATE__wrapStartTransactionWithProfiling(
    // This is already patched by sentry/tracing, we are going to re-patch it...
    carrier.__SENTRY__.extensions['startTransaction'] as StartTransaction,
  );
}
