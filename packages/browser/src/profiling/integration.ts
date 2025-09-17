import type { EventEnvelope, IntegrationFn, Profile, Span } from '@sentry/core';
import { debug, defineIntegration, getActiveSpan, getRootSpan, hasSpansEnabled } from '@sentry/core';
import type { BrowserOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import { BrowserTraceLifecycleProfiler } from './lifecycleMode/traceLifecycleProfiler';
import { startProfileForSpan } from './startProfileForSpan';
import type { ProfiledEvent } from './utils';
import {
  addProfilesToEnvelope,
  attachProfiledThreadToEvent,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  getActiveProfilesCount,
  hasLegacyProfiling,
  isAutomatedPageLoadSpan,
  shouldProfileSession,
  shouldProfileSpanLegacy,
  takeProfileFromGlobalCache,
} from './utils';

const INTEGRATION_NAME = 'BrowserProfiling';

const _browserProfilingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const options = client.getOptions() as BrowserOptions;

      if (options && !hasLegacyProfiling(options) && !options.profileLifecycle) {
        options.profileLifecycle = 'trace';
      }

      if (!options || (hasLegacyProfiling(options) && !options.profilesSampleRate)) {
        DEBUG_BUILD && debug.log('[Profiling] Profiling disabled, no profiling options found.');
        return;
      }

      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan && getRootSpan(activeSpan);

      // UI PROFILING (Profiling V2)
      if (!hasLegacyProfiling(options)) {
        const sessionSampled = shouldProfileSession(options);
        if (!sessionSampled) {
          DEBUG_BUILD && debug.log('[Profiling] Session not sampled. Skipping lifecycle profiler initialization.');
        }

        const lifecycleMode = options.profileLifecycle;

        if (lifecycleMode === 'trace') {
          if (!hasSpansEnabled(options)) {
            DEBUG_BUILD &&
              debug.warn(
                "[Profiling] `profileLifecycle` is 'trace' but tracing is disabled. Set a `tracesSampleRate` or `tracesSampler` to enable span tracing.",
              );
            return;
          }

          const traceLifecycleProfiler = new BrowserTraceLifecycleProfiler();
          traceLifecycleProfiler.initialize(client, sessionSampled);

          // If there is an active, sampled root span already, notify the profiler
          if (rootSpan) {
            traceLifecycleProfiler.notifyRootSpanActive(rootSpan);
          }

          // In case rootSpan is created slightly after setup -> schedule microtask to re-check and notify.
          WINDOW.setTimeout(() => {
            const laterActiveSpan = getActiveSpan();
            const laterRootSpan = laterActiveSpan && getRootSpan(laterActiveSpan);
            if (laterRootSpan) {
              traceLifecycleProfiler.notifyRootSpanActive(laterRootSpan);
            }
          }, 0);
        }

        // Adding client hook to attach profiles to transaction events before they are sent.
        client.on('beforeSendEvent', attachProfiledThreadToEvent);
      } else {
        // LEGACY PROFILING (v1)
        if (rootSpan && isAutomatedPageLoadSpan(rootSpan)) {
          if (shouldProfileSpanLegacy(rootSpan)) {
            startProfileForSpan(rootSpan);
          }
        }

        client.on('spanStart', (span: Span) => {
          if (span === getRootSpan(span) && shouldProfileSpanLegacy(span)) {
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
            const context = profiledTransaction?.contexts;
            const profile_id = context?.profile?.['profile_id'];
            const start_timestamp = context?.profile?.['start_timestamp'];

            if (typeof profile_id !== 'string') {
              DEBUG_BUILD && debug.log('[Profiling] cannot find profile for a span without a profile context');
              continue;
            }

            if (!profile_id) {
              DEBUG_BUILD && debug.log('[Profiling] cannot find profile for a span without a profile context');
              continue;
            }

            // Remove the profile from the span context before sending, relay will take care of the rest.
            if (context?.profile) {
              delete context.profile;
            }

            const profile = takeProfileFromGlobalCache(profile_id);
            if (!profile) {
              DEBUG_BUILD && debug.log(`[Profiling] Could not retrieve profile for span: ${profile_id}`);
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
      }
    },
  };
}) satisfies IntegrationFn;

export const browserProfilingIntegration = defineIntegration(_browserProfilingIntegration);
