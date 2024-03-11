import { defineIntegration, getActiveSpan, getRootSpan } from '@sentry/core';
import type { EventEnvelope, IntegrationFn, Span } from '@sentry/types';
import type { Profile } from '@sentry/types/src/profiling';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { startProfileForSpan } from './startProfileForSpan';
import type { ProfiledEvent } from './utils';
import { isAutomatedPageLoadSpan, shouldProfileSpan } from './utils';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  getActiveProfilesCount,
  takeProfileFromGlobalCache,
} from './utils';

const INTEGRATION_NAME = 'BrowserProfiling';

const _browserProfilingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan && getRootSpan(activeSpan);

      if (rootSpan && isAutomatedPageLoadSpan(rootSpan)) {
        if (shouldProfileSpan(rootSpan)) {
          startProfileForSpan(rootSpan);
        }
      }

      client.on('spanStart', (span: Span) => {
        if (span === getRootSpan(span) && shouldProfileSpan(span)) {
          startProfileForSpan(span);
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
            DEBUG_BUILD && logger.log('[Profiling] cannot find profile for a span without a profile context');
            continue;
          }

          if (!profile_id) {
            DEBUG_BUILD && logger.log('[Profiling] cannot find profile for a span without a profile context');
            continue;
          }

          // Remove the profile from the span context before sending, relay will take care of the rest.
          if (context && context['profile']) {
            delete context.profile;
          }

          const profile = takeProfileFromGlobalCache(profile_id);
          if (!profile) {
            DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for span: ${profile_id}`);
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
    },
  };
}) satisfies IntegrationFn;

export const browserProfilingIntegration = defineIntegration(_browserProfilingIntegration);
