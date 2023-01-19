import type { Envelope, InternalBaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/types';
import { logger } from '@sentry/utils';

export const START_DELAY = 5_000;
const MAX_DELAY = 2_000_000_000;
const DEFAULT_QUEUE_SIZE = 30;

function wasRateLimited(result: TransportMakeRequestResponse): boolean {
  return !!(result.headers && result.headers['x-sentry-rate-limits']);
}

type BeforeSendResponse = 'send' | 'queue' | 'drop';

interface OfflineTransportOptions extends InternalBaseTransportOptions {
  /**
   * The maximum number of events to keep in the offline queue.
   *
   * Defaults: 30
   */
  maxQueueSize?: number;

  /**
   * Flush the offline queue shortly after startup.
   *
   * Defaults: false
   */
  flushAtStartup?: boolean;

  /**
   * Called when an event is queued .
   */
  eventQueued?: () => void;

  /**
   * Called before attempting to send an event to Sentry.
   *
   * Return 'send' to attempt to send the event.
   * Return 'queue' to queue the event for sending later.
   * Return 'drop' to drop the event.
   */
  beforeSend?: (request: Envelope) => BeforeSendResponse | Promise<BeforeSendResponse>;
}

interface OfflineStore {
  insert(env: Envelope): Promise<void>;
  pop(): Promise<Envelope | undefined>;
}

export type CreateOfflineStore = (maxQueueCount: number) => OfflineStore;

/**
 * Wraps a transport and queues events when envelopes fail to send.
 *
 * @param createTransport The transport to wrap.
 * @param createStore The store implementation to use.
 */
export function makeOfflineTransport<TO>(
  createTransport: (options: TO) => Transport,
  createStore: CreateOfflineStore,
): (options: TO & OfflineTransportOptions) => Transport {
  return options => {
    const baseTransport = createTransport(options);
    const maxQueueSize = options.maxQueueSize === undefined ? DEFAULT_QUEUE_SIZE : options.maxQueueSize;
    const store = createStore(maxQueueSize);

    let retryDelay = START_DELAY;

    function queued(): void {
      if (options.eventQueued) {
        options.eventQueued();
      }
    }

    function queueRequest(envelope: Envelope): Promise<void> {
      return store.insert(envelope).then(() => {
        queued();

        setTimeout(() => {
          void flushQueue();
        }, retryDelay);

        retryDelay *= 3;

        // If the delay is bigger than 2^31 (max signed 32-bit int), setTimeout throws
        // an error on node.js and falls back to 1 which can cause a huge number of requests.
        if (retryDelay > MAX_DELAY) {
          retryDelay = MAX_DELAY;
        }
      });
    }

    async function flushQueue(): Promise<void> {
      const found = await store.pop();

      if (found) {
        __DEBUG_BUILD__ && logger.info('[Offline]: Attempting to send previously queued event');
        void send(found);
      }
    }

    async function send(request: Envelope): Promise<void | TransportMakeRequestResponse> {
      let action = 'send';

      if (options.beforeSend) {
        action = await options.beforeSend(request);
      }

      if (action === 'send') {
        try {
          const result = await baseTransport.send(request);
          if (wasRateLimited(result || {})) {
            __DEBUG_BUILD__ && logger.info('[Offline]: Event queued due to rate limiting');
            action = 'queue';
          } else {
            // Envelope was successfully sent
            // Reset the retry delay
            retryDelay = START_DELAY;
            // Check if there are any more in the queue
            void flushQueue();
            return result;
          }
        } catch (e) {
          __DEBUG_BUILD__ && logger.info('[Offline]: Event queued due to error', e);
          action = 'queue';
        }
      }

      if (action == 'queue') {
        void queueRequest(request);
      }

      return {};
    }

    if (options.flushAtStartup) {
      setTimeout(() => {
        void flushQueue();
      }, retryDelay);
    }

    return {
      send,
      flush: (timeout?: number) => baseTransport.flush(timeout),
    };
  };
}
