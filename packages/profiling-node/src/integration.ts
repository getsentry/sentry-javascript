import { defineIntegration, getCurrentScope, getRootSpan, spanToJSON } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import type { IntegrationFn, Span } from '@sentry/types';

import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { MAX_PROFILE_DURATION_MS, maybeProfileSpan, stopSpanProfile } from './spanProfileUtils';
import type { Profile, RawThreadCpuProfile } from './types';

import { addProfilesToEnvelope, createProfilingEvent, findProfiledTransactionsFromEnvelope } from './utils';

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

/** Exported only for tests. */
export const _nodeProfilingIntegration = (() => {
  return {
    name: 'ProfilingIntegration',
    setup(client: NodeClient) {
      const spanToProfileIdMap = new WeakMap<Span, string>();

      client.on('spanStart', span => {
        if (span !== getRootSpan(span)) {
          return;
        }

        const profile_id = maybeProfileSpan(client, span, undefined);

        if (profile_id) {
          const options = client.getOptions();
          // Not intended for external use, hence missing types, but we want to profile a couple of things at Sentry that
          // currently exceed the default timeout set by the SDKs.
          const maxProfileDurationMs =
            (options._experiments && options._experiments['maxProfileDurationMs']) || MAX_PROFILE_DURATION_MS;

          if (PROFILE_TIMEOUTS[profile_id]) {
            global.clearTimeout(PROFILE_TIMEOUTS[profile_id]);
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete PROFILE_TIMEOUTS[profile_id];
          }

          // Enqueue a timeout to prevent profiles from running over max duration.
          PROFILE_TIMEOUTS[profile_id] = global.setTimeout(() => {
            DEBUG_BUILD &&
              logger.log(
                '[Profiling] max profile duration elapsed, stopping profiling for:',
                spanToJSON(span).description,
              );

            const profile = stopSpanProfile(span, profile_id);
            if (profile) {
              addToProfileQueue(profile);
            }
          }, maxProfileDurationMs);

          getCurrentScope().setContext('profile', { profile_id });

          spanToProfileIdMap.set(span, profile_id);
        }
      });

      client.on('spanEnd', span => {
        const profile_id = spanToProfileIdMap.get(span);

        if (profile_id) {
          if (PROFILE_TIMEOUTS[profile_id]) {
            global.clearTimeout(PROFILE_TIMEOUTS[profile_id]);
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete PROFILE_TIMEOUTS[profile_id];
          }
          const profile = stopSpanProfile(span, profile_id);

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
          const profileContext = profiledTransaction.contexts?.['profile'];
          const profile_id = profileContext?.['profile_id'];

          if (!profile_id) {
            throw new TypeError('[Profiling] cannot find profile for a transaction without a profile context');
          }

          // Remove the profile from the transaction context before sending, relay will take care of the rest.
          if (profileContext) {
            delete profiledTransaction.contexts?.['profile'];
          }

          // We need to find both a profile and a transaction event for the same profile_id.
          const profileIndex = PROFILE_QUEUE.findIndex(p => p.profile_id === profile_id);
          if (profileIndex === -1) {
            DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          const cpuProfile = PROFILE_QUEUE[profileIndex];
          if (!cpuProfile) {
            DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          // Remove the profile from the queue.
          PROFILE_QUEUE.splice(profileIndex, 1);
          const profile = createProfilingEvent(client, cpuProfile, profiledTransaction);

          if (client.emit && profile) {
            const integrations =
              client['_integrations'] && client['_integrations'] !== null && !Array.isArray(client['_integrations'])
                ? Object.keys(client['_integrations'])
                : undefined;

            // @ts-expect-error bad overload due to unknown event
            client.emit('preprocessEvent', profile, {
              event_id: profiledTransaction.event_id,
              integrations,
            });
          }

          if (profile) {
            profilesToAddToEnvelope.push(profile);
          }
        }

        addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * We need this integration in order to send data to Sentry. We hook into the event processor
 * and inspect each event to see if it is a transaction event and if that transaction event
 * contains a profile on it's metadata. If that is the case, we create a profiling event envelope
 * and delete the profile from the transaction metadata.
 */
export const nodeProfilingIntegration = defineIntegration(_nodeProfilingIntegration);
