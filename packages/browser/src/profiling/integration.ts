import type { BrowserClient } from '@sentry/browser';
import type { Event, EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import { logger } from '@sentry/utils';

import { PROFILING_EVENT_CACHE } from './cache';
import { MAX_PROFILE_DURATION_MS, maybeProfileTransaction } from './hubextensions';
import { addProfilesToEnvelope, findProfiledTransactionsFromEnvelope } from './utils';

const MAX_PROFILE_QUEUE_LENGTH = 50;
const PROFILE_QUEUE: RawThreadCpuProfile[] = [];
const PROFILE_TIMEOUTS: Record<string, NodeJS.Timeout> = {};

function addToProfileQueue(profile: RawThreadCpuProfile): void {
  PROFILE_QUEUE.push(profile);

  // We only want to keep the last n profiles in the queue.
  if (PROFILE_QUEUE.length > MAX_PROFILE_QUEUE_LENGTH) {
    PROFILE_QUEUE.shift();
  }
}

/**
 * Browser profiling integration. Stores any event that has contexts["profile"]["profile_id"]
 * This exists because we do not want to await async profiler.stop calls as transaction.finish is called
 * in a synchronous context. Instead, we handle sending the profile async from the promise callback and
 * rely on being able to pull the event from the cache when we need to construct the envelope. This makes the
 * integration less reliable as we might be dropping profiles when the cache is full.
 *
 * @experimental
 */
export class BrowserProfilingIntegration implements Integration {
  public readonly name: string = 'BrowserProfilingIntegration';
  public getCurrentHub?: () => Hub = undefined;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.getCurrentHub = getCurrentHub;
    const client = this.getCurrentHub().getClient() as BrowserClient;

    if (client && typeof client.on === 'function') {
      client.on('startTransaction', (transaction: Transaction) => {
        const profile_id = maybeProfileTransaction(client, transaction, undefined);

        if (profile_id) {
          const options = client.getOptions();
          // Not intended for external use, hence missing types, but we want to profile a couple of things at Sentry that
          // currently exceed the default timeout set by the SDKs.
          const maxProfileDurationMs =
            (options._experiments && options._experiments['maxProfileDurationMs']) || MAX_PROFILE_DURATION_MS;

          // Enqueue a timeout to prevent profiles from running over max duration.
          if (PROFILE_TIMEOUTS[profile_id]) {
            global.clearTimeout(PROFILE_TIMEOUTS[profile_id]);
            delete PROFILE_TIMEOUTS[profile_id];
          }

          PROFILE_TIMEOUTS[profile_id] = global.setTimeout(() => {
            __DEBUG_BUILD__ &&
              logger.log('[Profiling] max profile duration elapsed, stopping profiling for:', transaction.name);

            const profile = stopTransactionProfile(transaction, profile_id);
            if (profile) {
              addToProfileQueue(profile);
            }
          }, maxProfileDurationMs);

          transaction.setContext('profile', { profile_id });
          // @ts-expect-error profile_id is not part of the metadata type
          transaction.setMetadata({ profile_id: profile_id });
        }
      });

      client.on('finishTransaction', transaction => {
        // @ts-expect-error profile_id is not part of the metadata type
        const profile_id = transaction && transaction.metadata && transaction.metadata.profile_id;
        if (profile_id) {
          if (PROFILE_TIMEOUTS[profile_id]) {
            global.clearTimeout(PROFILE_TIMEOUTS[profile_id]);
            delete PROFILE_TIMEOUTS[profile_id];
          }
          const profile = stopTransactionProfile(transaction, profile_id);

          if (profile) {
            addToProfileQueue(profile);
          }
        }
      });

      client.on('beforeEnvelope', (envelope): void => {
        // if not profiles are in queue, there is nothing to add to the envelope.
        if (!PROFILE_QUEUE.length) {
          return;
        }

        const profiledTransactionEvents = findProfiledTransactionsFromEnvelope(envelope);
        if (!profiledTransactionEvents.length) {
          return;
        }

        const profilesToAddToEnvelope: Profile[] = [];

        for (const profiledTransaction of profiledTransactionEvents) {
          const profile_id = profiledTransaction?.contexts?.['profile']?.['profile_id'];

          if (!profile_id) {
            throw new TypeError('[Profiling] cannot find profile for a transaction without a profile context');
          }

          // Remove the profile from the transaction context before sending, relay will take care of the rest.
          if (profiledTransaction?.contexts?.['.profile']) {
            delete profiledTransaction.contexts.profile;
          }

          // We need to find both a profile and a transaction event for the same profile_id.
          const profileIndex = PROFILE_QUEUE.findIndex(p => p.profile_id === profile_id);
          if (profileIndex === -1) {
            __DEBUG_BUILD__ && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          const cpuProfile = PROFILE_QUEUE[profileIndex];
          if (!cpuProfile) {
            __DEBUG_BUILD__ && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          // Remove the profile from the queue.
          PROFILE_QUEUE.splice(profileIndex, 1);
          const profile = createProfilingEvent(cpuProfile, profiledTransaction);

          if (profile) {
            profilesToAddToEnvelope.push(profile);
          }
        }

        addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
      });
    } else {
      logger.warn('[Profiling] Client does not support hooks, profiling will be disabled');
    }
  }

  /**
   * @inheritDoc
   */
  public handleGlobalEvent(event: Event): Event {
    const profileId = event.contexts && event.contexts['profile'] && event.contexts['profile']['profile_id'];

    if (profileId && typeof profileId === 'string') {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Profiling event found, caching it.');
      }
      PROFILING_EVENT_CACHE.add(profileId, event);
    }

    return event;
  }
}
