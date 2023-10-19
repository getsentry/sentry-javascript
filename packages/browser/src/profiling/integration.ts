import type { EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import type { Profile } from '@sentry/types/src/profiling';
import { logger } from '@sentry/utils';

import { wrapTransactionWithProfiling } from './hubextensions';
import { getAutomatedPageLoadProfile, ProfiledEvent, addProfileToMap, AUTOMATED_PAGELOAD_PROFILE_ID } from './utils';
import { getMainCarrier } from '@sentry/core';
import { JSSelfProfile } from '../../build/npm/types/profiling/jsSelfProfiling';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  isAutomatedPageLoadTransaction,
  findProfiledTransactionsFromEnvelope,
  PROFILE_MAP,
} from './utils';

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
  public static id: string = 'BrowserProfilingIntegration';

  public readonly name: string;

  public getCurrentHub?: () => Hub;

  public constructor() {
    this.name = BrowserProfilingIntegration.id;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.getCurrentHub = getCurrentHub;

    const hub = this.getCurrentHub();
    const client = hub.getClient();
    const carrier = getMainCarrier();

    if (client && typeof client.on === 'function') {
      client.on('startTransaction', (transaction: Transaction) => {
        wrapTransactionWithProfiling(transaction);
      });

      // If a pageload profile exists, attach finishTransaction handler and set profile_id to the reserved
      // automated page load profile id so that it will get picked up by the beforeEnvelope hook.
      const pageLoadProfile = getAutomatedPageLoadProfile(carrier);
      if (pageLoadProfile) {
        client.on('finishTransaction', (transaction: Transaction) => {
          if (!isAutomatedPageLoadTransaction(transaction)) {
            return;
          }

          transaction.setContext('profile', { profile_id: AUTOMATED_PAGELOAD_PROFILE_ID });
          pageLoadProfile
            .stop()
            .then((p: JSSelfProfile): null => {
              if (__DEBUG_BUILD__) {
                logger.log(
                  `[Profiling] stopped profiling of transaction: ${transaction.name || transaction.description}`,
                );
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

              addProfileToMap(AUTOMATED_PAGELOAD_PROFILE_ID, p);
              return null;
            })
            .catch(error => {
              if (__DEBUG_BUILD__) {
                logger.log('[Profiling] error while stopping profiler:', error);
              }
              return null;
            });
        });
      }

      client.on('beforeEnvelope', (envelope): void => {
        // if not profiles are in queue, there is nothing to add to the envelope.
        if (!PROFILE_MAP['size']) {
          return;
        }

        const profiledTransactionEvents = findProfiledTransactionsFromEnvelope(envelope);
        if (!profiledTransactionEvents.length) {
          return;
        }

        const profilesToAddToEnvelope: Profile[] = [];

        for (const profiledTransaction of profiledTransactionEvents) {
          const context = profiledTransaction && profiledTransaction.contexts;
          const profile_id = context && context['profile'] && context['profile']['profile_id'];

          if (typeof profile_id !== "string") {
            __DEBUG_BUILD__ &&
              logger.log('[Profiling] cannot find profile for a transaction without a profile context');
            continue;
          }

          if (!profile_id) {
            __DEBUG_BUILD__ &&
              logger.log('[Profiling] cannot find profile for a transaction without a profile context');
            continue;
          }

          // Remove the profile from the transaction context before sending, relay will take care of the rest.
          if (context && context['profile']) {
            delete context.profile;
          }

          const profile = PROFILE_MAP.get(profile_id);
          if (!profile) {
            __DEBUG_BUILD__ && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          PROFILE_MAP.delete(profile_id);
          const profileEvent = createProfilingEvent(profile_id, profile, profiledTransaction as ProfiledEvent);

          if (profileEvent) {
            profilesToAddToEnvelope.push(profileEvent);
          }
        }

        addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
      });
    } else {
      logger.warn('[Profiling] Client does not support hooks, profiling will be disabled');
    }
  }
}
