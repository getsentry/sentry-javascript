import { getMainCarrier } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import type { CustomSamplingContext, Hub, Transaction, TransactionContext } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import { CpuProfilerBindings } from './cpu_profiler';
import { isDebugBuild } from './env';
import { isValidSampleRate } from './utils';

export const MAX_PROFILE_DURATION_MS = 30 * 1000;

type StartTransaction = (
  this: Hub,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
) => Transaction;

/**
 * Takes a transaction and determines if it should be profiled or not. If it should be profiled, it returns the
 * profile_id, otherwise returns undefined. Takes care of setting profile context on transaction as well
 */
export function maybeProfileTransaction(
  client: NodeClient | undefined,
  transaction: Transaction,
  customSamplingContext?: CustomSamplingContext,
): string | undefined {
  // profilesSampleRate is multiplied with tracesSampleRate to get the final sampling rate. We dont perform
  // the actual multiplication to get the final rate, but we discard the profile if the transaction was sampled,
  // so anything after this block from here is based on the transaction sampling.
  // eslint-disable-next-line deprecation/deprecation
  if (!transaction.sampled) {
    return;
  }

  // Client and options are required for profiling
  if (!client) {
    if (isDebugBuild()) {
      logger.log('[Profiling] Profiling disabled, no client found.');
    }
    return;
  }

  const options = client.getOptions();
  if (!options) {
    if (isDebugBuild()) {
      logger.log('[Profiling] Profiling disabled, no options found.');
    }
    return;
  }

  const profilesSampler = options.profilesSampler;
  let profilesSampleRate: number | boolean | undefined = options.profilesSampleRate;

  // Prefer sampler to sample rate if both are provided.
  if (typeof profilesSampler === 'function') {
    // eslint-disable-next-line deprecation/deprecation
    profilesSampleRate = profilesSampler({ transactionContext: transaction.toContext(), ...customSamplingContext });
  }

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
  // only valid values are booleans or numbers between 0 and 1.)
  if (!isValidSampleRate(profilesSampleRate)) {
    if (isDebugBuild()) {
      logger.warn('[Profiling] Discarding profile because of invalid sample rate.');
    }
    return;
  }

  // if the function returned 0 (or false), or if `profileSampleRate` is 0, it's a sign the profile should be dropped
  if (!profilesSampleRate) {
    if (isDebugBuild()) {
      logger.log(
        `[Profiling] Discarding profile because ${
          typeof profilesSampler === 'function'
            ? 'profileSampler returned 0 or false'
            : 'a negative sampling decision was inherited or profileSampleRate is set to 0'
        }`,
      );
    }
    return;
  }

  // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
  // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
  const sampled = profilesSampleRate === true ? true : Math.random() < profilesSampleRate;
  // Check if we should sample this profile
  if (!sampled) {
    if (isDebugBuild()) {
      logger.log(
        `[Profiling] Discarding profile because it's not included in the random sample (sampling rate = ${Number(
          profilesSampleRate,
        )})`,
      );
    }
    return;
  }

  const profile_id = uuid4();
  CpuProfilerBindings.startProfiling(profile_id);
  if (isDebugBuild()) {
    // eslint-disable-next-line deprecation/deprecation
    logger.log(`[Profiling] started profiling transaction: ${transaction.name}`);
  }

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
export function stopTransactionProfile(
  transaction: Transaction,
  profile_id: string | undefined,
): ReturnType<(typeof CpuProfilerBindings)['stopProfiling']> | null {
  // Should not happen, but satisfy the type checker and be safe regardless.
  if (!profile_id) {
    return null;
  }

  const profile = CpuProfilerBindings.stopProfiling(profile_id);

  if (isDebugBuild()) {
    // eslint-disable-next-line deprecation/deprecation
    logger.log(`[Profiling] stopped profiling of transaction: ${transaction.name}`);
  }

  // In case of an overlapping transaction, stopProfiling may return null and silently ignore the overlapping profile.
  if (!profile) {
    if (isDebugBuild()) {
      logger.log(
        // eslint-disable-next-line deprecation/deprecation
        `[Profiling] profiler returned null profile for: ${transaction.name}`,
        'this may indicate an overlapping transaction or a call to stopProfiling with a profile title that was never started',
      );
    }
    return null;
  }

  // Assign profile_id to the profile
  profile.profile_id = profile_id;
  return profile;
}

/**
 * Wraps startTransaction and stopTransaction with profiling related logic.
 * startProfiling is called after the call to startTransaction in order to avoid our own code from
 * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
 */
export function __PRIVATE__wrapStartTransactionWithProfiling(startTransaction: StartTransaction): StartTransaction {
  return function wrappedStartTransaction(
    this: Hub,
    transactionContext: TransactionContext,
    customSamplingContext?: CustomSamplingContext,
  ): Transaction {
    const transaction: Transaction = startTransaction.call(this, transactionContext, customSamplingContext);

    // Client is required if we want to profile
    // eslint-disable-next-line deprecation/deprecation
    const client = this.getClient() as NodeClient | undefined;
    if (!client) {
      return transaction;
    }

    // Check if we should profile this transaction. If a profile_id is returned, then profiling has been started.
    const profile_id = maybeProfileTransaction(client, transaction, customSamplingContext);
    if (!profile_id) {
      return transaction;
    }

    // A couple of important things to note here:
    // `CpuProfilerBindings.stopProfiling` will be scheduled to run in 30seconds in order to exceed max profile duration.
    // Whichever of the two (transaction.finish/timeout) is first to run, the profiling will be stopped and the gathered profile
    // will be processed when the original transaction is finished. Since onProfileHandler can be invoked multiple times in the
    // event of an error or user mistake (calling transaction.finish multiple times), it is important that the behavior of onProfileHandler
    // is idempotent as we do not want any timings or profiles to be overriden by the last call to onProfileHandler.
    // After the original finish method is called, the event will be reported through the integration and delegated to transport.
    let profile: ReturnType<(typeof CpuProfilerBindings)['stopProfiling']> | null = null;

    const options = client.getOptions();
    // Not intended for external use, hence missing types, but we want to profile a couple of things at Sentry that
    // currently exceed the default timeout set by the SDKs.
    const maxProfileDurationMs =
      (options._experiments && options._experiments['maxProfileDurationMs']) || MAX_PROFILE_DURATION_MS;

    // Enqueue a timeout to prevent profiles from running over max duration.
    let maxDurationTimeoutID: NodeJS.Timeout | void = global.setTimeout(() => {
      if (isDebugBuild()) {
        // eslint-disable-next-line deprecation/deprecation
        logger.log('[Profiling] max profile duration elapsed, stopping profiling for:', transaction.name);
      }
      profile = stopTransactionProfile(transaction, profile_id);
    }, maxProfileDurationMs);

    // We need to reference the original finish call to avoid creating an infinite loop
    // eslint-disable-next-line deprecation/deprecation
    const originalFinish = transaction.finish.bind(transaction);

    // Wrap the transaction finish method to stop profiling and set the profile on the transaction.
    function profilingWrappedTransactionFinish(): void {
      if (!profile_id) {
        return originalFinish();
      }

      // We stop the handler first to ensure that the timeout is cleared and the profile is stopped.
      if (maxDurationTimeoutID) {
        global.clearTimeout(maxDurationTimeoutID);
        maxDurationTimeoutID = undefined;
      }

      // onProfileHandler should always return the same profile even if this is called multiple times.
      // Always call onProfileHandler to ensure stopProfiling is called and the timeout is cleared.
      if (!profile) {
        profile = stopTransactionProfile(transaction, profile_id);
      }

      // @ts-expect-error profile is not part of metadata
      // eslint-disable-next-line deprecation/deprecation
      transaction.setMetadata({ profile });
      return originalFinish();
    }

    // eslint-disable-next-line deprecation/deprecation
    transaction.finish = profilingWrappedTransactionFinish;
    return transaction;
  };
}

/**
 * Patches startTransaction and stopTransaction with profiling logic.
 * This is used by the SDK's that do not support event hooks.
 * @private
 */
function _addProfilingExtensionMethods(): void {
  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    if (isDebugBuild()) {
      logger.log("[Profiling] Can't find main carrier, profiling won't work.");
    }
    return;
  }

  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (!carrier.__SENTRY__.extensions['startTransaction']) {
    if (isDebugBuild()) {
      logger.log('[Profiling] startTransaction does not exists, profiling will not work.');
    }
    return;
  }

  if (isDebugBuild()) {
    logger.log('[Profiling] startTransaction exists, patching it with profiling functionality...');
  }

  carrier.__SENTRY__.extensions['startTransaction'] = __PRIVATE__wrapStartTransactionWithProfiling(
    // This is patched by sentry/tracing, we are going to re-patch it...
    carrier.__SENTRY__.extensions['startTransaction'] as StartTransaction,
  );
}

/**
 * This patches the global object and injects the Profiling extensions methods
 */
export function addProfilingExtensionMethods(): void {
  _addProfilingExtensionMethods();
}
