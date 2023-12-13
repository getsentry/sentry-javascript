import type { EventEnvelope, EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import type { Profile } from '@sentry/types/src/profiling';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { startProfileForTransaction } from './hubextensions';
import type { ProfiledEvent } from './utils';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  getActiveProfilesCount,
  isAutomatedPageLoadTransaction,
  shouldProfileTransaction,
  takeProfileFromGlobalCache,
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
    const scope = hub.getScope();

    const transaction = scope.getTransaction();

    if (transaction && isAutomatedPageLoadTransaction(transaction)) {
      if (shouldProfileTransaction(transaction)) {
        startProfileForTransaction(transaction);
      }
    }

    if (client && typeof client.on === 'function') {
      client.on('startTransaction', (transaction: Transaction) => {
        if (shouldProfileTransaction(transaction)) {
          startProfileForTransaction(transaction);
        }
      });

      client.on('beforeEnvelope', (envelope): void => {
        // if not profiles are in queue, there is nothing to add to the envelope.
        if (!getActiveProfilesCount()) {
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
          const start_timestamp = context && context['profile'] && context['profile']['start_timestamp'];

          if (typeof profile_id !== 'string') {
            DEBUG_BUILD && logger.log('[Profiling] cannot find profile for a transaction without a profile context');
            continue;
          }

          if (!profile_id) {
            DEBUG_BUILD && logger.log('[Profiling] cannot find profile for a transaction without a profile context');
            continue;
          }

          // Remove the profile from the transaction context before sending, relay will take care of the rest.
          if (context && context['profile']) {
            delete context.profile;
          }

          const profile = takeProfileFromGlobalCache(profile_id);
          if (!profile) {
            DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          const profileEvent = createProfilingEvent(
            profile_id,
            start_timestamp as number | undefined,
            profile,
            profiledTransaction as ProfiledEvent,
          );
          if (profileEvent) {
            profilesToAddToEnvelope.push(profileEvent);
          }
        }

        addProfilesToEnvelope(envelope as EventEnvelope, profilesToAddToEnvelope);
      });
    } else {
      logger.warn('[Profiling] Client does not support hooks, profiling will be disabled');
    }
  }
}
