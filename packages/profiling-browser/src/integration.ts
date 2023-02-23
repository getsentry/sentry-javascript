import { getCurrentHub } from '@sentry/core';
import type { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { LRUMap } from 'lru_map';

import type { ProcessedJSSelfProfile } from './jsSelfProfiling';
import type { ProfiledEvent } from './utils';
import { createProfilingEventEnvelope } from './utils';

// We need this integration in order to actually send data to Sentry. We hook into the event processor
// and inspect each event to see if it is a transaction event and if that transaction event
// contains a profile on it's metadata. If that is the case, we create a profiling event envelope
// and delete the profile from the transaction metadata.

export const PROFILING_EVENT_CACHE = new LRUMap<string, Event>(20);
/**
 *
 */
export class BrowserProfilingIntegration implements Integration {
  public readonly name: string = 'BrowserProfilingIntegration';
  public getCurrentHub?: () => Hub = undefined;

  /**
   *
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.getCurrentHub = getCurrentHub;
    addGlobalEventProcessor(this.handleGlobalEvent.bind(this));
  }

  /**
   * Handle global event
   */
  public handleGlobalEvent(event: Event): Event {
    const profile_id = event.contexts && event.contexts['profile'] && event.contexts['profile']['profile_id'];

    if (profile_id && typeof profile_id === 'string') {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Profiling event found, caching it.');
      }
      PROFILING_EVENT_CACHE.set(profile_id, event);
    }

    return event;
  }
}

/**
 *
 */
export function sendProfile(profile_id: string, profile: ProcessedJSSelfProfile): void {
  const event = PROFILING_EVENT_CACHE.get(profile_id);

  if(!event){
    // We could not find a corresponding transaction event for this profile.
    // Opt to do nothing for now, but in the future we should implement a simple retry mechanism.
    return
  }

  event.sdkProcessingMetadata = event.sdkProcessingMetadata || {}
  if(event.sdkProcessingMetadata && !event.sdkProcessingMetadata['profile']){
    event.sdkProcessingMetadata['profile'] = profile
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
      return
    }

    const dsn = client.getDsn();
    if (!dsn) {
      if (__DEBUG_BUILD__) {
        logger.log(
          '[Profiling] getDsn did not return a Dsn, removing profile from event and forwarding to next event processors.',
        );
      }
      return
    }

    const transport = client.getTransport();
    if (!transport) {
      if (__DEBUG_BUILD__) {
        logger.log(
          '[Profiling] getTransport did not return a Transport, removing profile from event and forwarding to next event processors.',
        );
      }
      return
    }

    // If all required components are available, we construct a profiling event envelope and send it to Sentry.
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Preparing envelope and sending a profiling event');
    }
    const envelope = createProfilingEventEnvelope(event as ProfiledEvent, dsn);

    if (!envelope) {
      if(__DEBUG_BUILD__) {
        logger.log('[Profiling] Failed to construct envelope');
      }
      return
    }

    if(__DEBUG_BUILD__) {
      logger.log('[Profiling] Envelope constructed, sending it');
    }
    void transport.send(envelope);
}
