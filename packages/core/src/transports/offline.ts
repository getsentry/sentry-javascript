import type { Envelope, InternalBaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/types';
import { forEachEnvelopeItem, logger, parseRetryAfterHeader } from '@sentry/utils';

export const MIN_DELAY = 100; // 100 ms
export const START_DELAY = 5_000; // 5 seconds
const MAX_DELAY = 3.6e6; // 1 hour
const DEFAULT_QUEUE_SIZE = 30;

function isReplayEnvelope(envelope: Envelope): boolean {
  let isReplay = false;

  forEachEnvelopeItem(envelope, (_, type) => {
    if (type === 'replay_event') {
      isReplay = true;
    }
  });

  return isReplay;
}

interface OfflineTransportOptions extends InternalBaseTransportOptions {
  /**
   * The maximum number of events to keep in the offline store.
   *
   * Defaults: 30
   */
  maxQueueSize?: number;

  /**
   * Flush the offline store shortly after startup.
   *
   * Defaults: false
   */
  flushAtStartup?: boolean;

  /**
   * Called before an event is stored.
   *
   * Return false to drop the envelope rather than store it.
   *
   * @param envelope The envelope that failed to send.
   * @param error The error that occurred.
   * @param retryDelay The current retry delay in milliseconds.
   */
  shouldStore?: (envelope: Envelope, error: Error, retryDelay: number) => boolean | Promise<boolean>;
}

interface OfflineStore {
  insert(env: Envelope): Promise<void>;
  pop(): Promise<Envelope | undefined>;
}

export type CreateOfflineStore = (maxQueueCount: number) => OfflineStore;

type Timer = number | { unref?: () => void };

/**
 * Wraps a transport and stores and retries events when they fail to send.
 *
 * @param createTransport The transport to wrap.
 * @param createStore The store implementation to use.
 */
export function makeOfflineTransport<TO>(
  createTransport: (options: TO) => Transport,
  createStore: CreateOfflineStore,
): (options: TO & OfflineTransportOptions) => Transport {
  return options => {
    const transport = createTransport(options);
    const maxQueueSize = options.maxQueueSize === undefined ? DEFAULT_QUEUE_SIZE : options.maxQueueSize;
    const store = createStore(maxQueueSize);

    let retryDelay = START_DELAY;
    let flushTimer: Timer | undefined;

    function log(msg: string, error?: Error): void {
      __DEBUG_BUILD__ && logger.info(`[Offline]: ${msg}`, error);
    }

    function shouldQueue(env: Envelope, error: Error, retryDelay: number): boolean | Promise<boolean> {
      if (isReplayEnvelope(env)) {
        return false;
      }

      if (options.shouldStore) {
        return options.shouldStore(env, error, retryDelay);
      }

      return true;
    }

    function flushIn(delay: number): void {
      if (flushTimer) {
        clearTimeout(flushTimer as ReturnType<typeof setTimeout>);
      }

      flushTimer = setTimeout(async () => {
        flushTimer = undefined;

        const found = await store.pop();
        if (found) {
          log('Attempting to send previously queued event');
          void send(found).catch(e => {
            log('Failed to retry sending', e);
          });
        }
      }, delay) as Timer;

      // We need to unref the timer in node.js, otherwise the node process never exit.
      if (typeof flushTimer !== 'number' && typeof flushTimer.unref === 'function') {
        flushTimer.unref();
      }
    }

    function flushWithBackOff(): void {
      if (flushTimer) {
        return;
      }

      flushIn(retryDelay);

      retryDelay *= 2;

      if (retryDelay > MAX_DELAY) {
        retryDelay = MAX_DELAY;
      }
    }

    async function send(envelope: Envelope): Promise<void | TransportMakeRequestResponse> {
      try {
        const result = await transport.send(envelope);

        let delay = MIN_DELAY;

        if (result) {
          // If there's a retry-after header, use that as the next delay.
          if (result.headers && result.headers['retry-after']) {
            delay = parseRetryAfterHeader(result.headers['retry-after']);
          } // If we have a server error, return now so we don't flush the queue.
          else if ((result.statusCode || 0) >= 400) {
            return result;
          }
        }

        flushIn(delay);
        retryDelay = START_DELAY;
        return result;
      } catch (e) {
        if (await shouldQueue(envelope, e, retryDelay)) {
          await store.insert(envelope);
          flushWithBackOff();
          log('Error sending. Event queued', e);
          return {};
        } else {
          throw e;
        }
      }
    }

    if (options.flushAtStartup) {
      flushWithBackOff();
    }

    return {
      send,
      flush: (timeout?: number) => transport.flush(timeout),
    };
  };
}
