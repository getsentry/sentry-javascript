import { getCurrentHub } from '@sentry/core';
import type { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { addExtensionMethods } from './hubextensions';
import type { ProcessedJSSelfProfile } from './jsSelfProfiling';
import type { ProfiledEvent } from './utils';
import { createProfilingEventEnvelope } from './utils';

/**
 * Creates a simple cache that evicts keys in fifo order
 * @param size {Number}
 */
export function makeProfilingCache<Key extends string, Value extends Event>(
  size: number,
): {
  get: (key: Key) => Value | undefined;
  add: (key: Key, value: Value) => void;
  delete: (key: Key) => boolean;
  clear: () => void;
  size: () => number;
} {
  // Maintain a fifo queue of keys, we cannot rely on Object.keys as the browser may not support it.
  let evictionOrder: Key[] = [];
  let cache: Record<string, Value> = {};

  return {
    add(key: Key, value: Value) {
      while (evictionOrder.length >= size) {
        // shift is O(n) but this is small size and only happens if we are
        // exceeding the cache size so it should be fine.
        const evictCandidate = evictionOrder.shift();

        if (evictCandidate !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete cache[evictCandidate];
        }
      }

      // in case we have a collision, delete the old key.
      if (cache[key]) {
        this.delete(key);
      }

      evictionOrder.push(key);
      cache[key] = value;
    },
    clear() {
      cache = {};
      evictionOrder = [];
    },
    get(key: Key): Value | undefined {
      return cache[key];
    },
    size() {
      return evictionOrder.length;
    },
    // Delete cache key and return true if it existed, false otherwise.
    delete(key: Key): boolean {
      if (!cache[key]) {
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete cache[key];

      for (let i = 0; i < evictionOrder.length; i++) {
        if (evictionOrder[i] === key) {
          evictionOrder.splice(i, 1);
          break;
        }
      }

      return true;
    },
  };
}

export const PROFILING_EVENT_CACHE = makeProfilingCache<string, Event>(20);
/**
 * Browser profiling integration. Stores any event that has contexts["profile"]["profile_id"]
 * This exists because we do not want to await async profiler.stop calls as transaction.finish is called
 * in a synchronous context. Instead, we handle sending the profile async from the promise callback and
 * rely on being able to pull the event from the cache when we need to construct the envelope. This makes the
 * integration less reliable as we might be dropping profiles when the cache is full.
 */
export class BrowserProfilingIntegration implements Integration {
  public readonly name: string = 'BrowserProfilingIntegration';

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // Patching the hub to add the extension methods.
    // Warning: we have an implicit dependency on import order and we will fail patching if the constructor of
    // BrowserProfilingIntegration is called before @sentry/tracing is imported. This is because we need to patch
    // the methods of @sentry/tracing which are patched as a side effect of importing @sentry/tracing.
    addExtensionMethods();

    // Add our event processor
    addGlobalEventProcessor(this.handleGlobalEvent.bind(this));
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
