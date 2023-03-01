import type { Event, EventProcessor, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { addProfilingExtensionMethods } from './hubextensions';

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
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    // Patching the hub to add the extension methods.
    // Warning: we have an implicit dependency on import order and we will fail patching if the constructor of
    // BrowserProfilingIntegration is called before @sentry/tracing is imported. This is because we need to patch
    // the methods of @sentry/tracing which are patched as a side effect of importing @sentry/tracing.
    addProfilingExtensionMethods();

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
