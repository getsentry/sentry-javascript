import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import { PROFILING_EVENT_CACHE } from './browserProfiling';
import type { ProcessedJSSelfProfile } from './jsSelfProfiling';
import type { ProfiledEvent } from './utils';
import { createProfilingEventEnvelope } from './utils';
/**
 * Performs lookup in the event cache and sends the profile to Sentry.
 * If the profiled transaction event is found, we use the profiled transaction event and profile
 * to construct a profile type envelope and send it to Sentry.
 */
export function sendProfile(profileId: string, profile: ProcessedJSSelfProfile): void {
  const event = PROFILING_EVENT_CACHE.get(profileId);

  if (!event) {
    // We could not find a corresponding transaction event for this profile.
    // Opt to do nothing for now, but in the future we should implement a simple retry mechanism.
    if (__DEBUG_BUILD__) {
      logger.log("[Profiling] Couldn't find a transaction event for this profile, dropping it.");
    }
    return;
  }

  event.sdkProcessingMetadata = event.sdkProcessingMetadata || {};
  if (event.sdkProcessingMetadata && !event.sdkProcessingMetadata['profile']) {
    event.sdkProcessingMetadata['profile'] = profile;
  }

  // Client, Dsn and Transport are all required to be able to send the profiling event to Sentry.
  // If either of them is not available, we remove the profile from the transaction event.
  // and forward it to the next event processor.
  const hub = getCurrentHub();
  const client = hub.getClient();

  if (!client) {
    if (__DEBUG_BUILD__) {
      logger.log(
        '[Profiling] getClient did not return a Client, removing profile from event and forwarding to next event processors.',
      );
    }
    return;
  }

  const dsn = client.getDsn();
  if (!dsn) {
    if (__DEBUG_BUILD__) {
      logger.log(
        '[Profiling] getDsn did not return a Dsn, removing profile from event and forwarding to next event processors.',
      );
    }
    return;
  }

  const transport = client.getTransport();
  if (!transport) {
    if (__DEBUG_BUILD__) {
      logger.log(
        '[Profiling] getTransport did not return a Transport, removing profile from event and forwarding to next event processors.',
      );
    }
    return;
  }

  // If all required components are available, we construct a profiling event envelope and send it to Sentry.
  if (__DEBUG_BUILD__) {
    logger.log('[Profiling] Preparing envelope and sending a profiling event');
  }
  const envelope = createProfilingEventEnvelope(event as ProfiledEvent, dsn);

  // Evict event from the cache - we want to prevent the LRU cache from prioritizing already sent events over new ones.
  PROFILING_EVENT_CACHE.delete(profileId);

  if (!envelope) {
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Failed to construct envelope');
    }
    return;
  }

  if (__DEBUG_BUILD__) {
    logger.log('[Profiling] Envelope constructed, sending it');
  }

  void transport.send(envelope);
}
