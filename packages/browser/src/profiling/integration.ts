import type { EventEnvelope, IntegrationFn, Profile, Span } from '@sentry/core';
import { debug, defineIntegration, getActiveSpan, getRootSpan, hasSpansEnabled } from '@sentry/core';
import type { BrowserOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import { startProfileForSpan } from './startProfileForSpan';
import { UIProfiler } from './UIProfiler';
import type { ProfiledEvent } from './utils';
import {
  addProfilesToEnvelope,
  attachProfiledThreadToEvent,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  getActiveProfilesCount,
  hasLegacyProfiling,
  isAutomatedPageLoadSpan,
  shouldProfileSpanLegacy,
  takeProfileFromGlobalCache,
} from './utils';

const INTEGRATION_NAME = 'BrowserProfiling';

const _browserProfilingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const options = client.getOptions() as BrowserOptions;
      const profiler = new UIProfiler();

      if (!hasLegacyProfiling(options) && !options.profileLifecycle) {
        // Set default lifecycle mode
        options.profileLifecycle = 'manual';
      }

      // eslint-disable-next-line deprecation/deprecation
      if (hasLegacyProfiling(options) && !options.profilesSampleRate) {
        DEBUG_BUILD && debug.log('[Profiling] Profiling disabled, no profiling options found.');
        return;
      }

      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan && getRootSpan(activeSpan);

      if (hasLegacyProfiling(options) && options.profileSessionSampleRate !== undefined) {
        DEBUG_BUILD &&
          debug.warn(
            '[Profiling] Both legacy profiling (`profilesSampleRate`) and UI profiling settings are defined. `profileSessionSampleRate` has no effect when legacy profiling is enabled.',
          );
      }

      // UI PROFILING (Profiling V2)
      if (!hasLegacyProfiling(options)) {
        const lifecycleMode = options.profileLifecycle;

        // Registering hooks in all lifecycle modes to be able to notify users in case they want to start/stop the profiler manually in `trace` mode
        client.on('startUIProfiler', () => profiler.start());
        client.on('stopUIProfiler', () => profiler.stop());

        if (lifecycleMode === 'manual') {
          profiler.initialize(client);
        } else if (lifecycleMode === 'trace') {
          if (!hasSpansEnabled(options)) {
            DEBUG_BUILD &&
              debug.warn(
                "[Profiling] `profileLifecycle` is 'trace' but tracing is disabled. Set a `tracesSampleRate` or `tracesSampler` to enable span tracing.",
              );
            return;
          }

          profiler.initialize(client);

          // If there is an active, sampled root span already, notify the profiler
          if (rootSpan) {
            profiler.notifyRootSpanActive(rootSpan);
          }

          // In case rootSpan is created slightly after setup -> schedule microtask to re-check and notify.
          WINDOW.setTimeout(() => {
            const laterActiveSpan = getActiveSpan();
            const laterRootSpan = laterActiveSpan && getRootSpan(laterActiveSpan);
            if (laterRootSpan) {
              profiler.notifyRootSpanActive(laterRootSpan);
            }
          }, 0);
        }
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
    processEvent(event) {
      return attachProfiledThreadToEvent(event);
    },
  };
}) satisfies IntegrationFn;

export const browserProfilingIntegration = defineIntegration(_browserProfilingIntegration);
