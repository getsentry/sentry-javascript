import type { EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import type { Profile } from '@sentry/types/src/profiling';
import { logger } from '@sentry/utils';

import type { BrowserClient } from './../client';
import { wrapTransactionWithProfiling } from './hubextensions';
import type { ProfiledEvent } from './utils';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
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
    const client = this.getCurrentHub().getClient() as BrowserClient;

    if (client && typeof client.on === 'function') {
      client.on('startTransaction', (transaction: Transaction) => {
        wrapTransactionWithProfiling(transaction);
      });

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
          const profile_id = context && context['profile'] && (context['profile']['profile_id'] as string);

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
