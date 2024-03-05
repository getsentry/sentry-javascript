import type { Envelope, InternalBaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/types';
import { envelopeContainsItemType, logger, parseRetryAfterHeader } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

export const MIN_DELAY = 100; // 100 ms
export const START_DELAY = 5_000; // 5 seconds
const MAX_DELAY = 3.6e6; // 1 hour

function log(msg: string, error?: Error): void {
  DEBUG_BUILD && logger.info(`[Offline]: ${msg}`, error);
}

export interface OfflineStore {
  insert(env: Envelope): Promise<void>;
  pop(): Promise<Envelope | undefined>;
}

export type CreateOfflineStore = (options: OfflineTransportOptions) => OfflineStore;

export interface OfflineTransportOptions extends InternalBaseTransportOptions {
  /**
   * A function that creates the offline store instance.
   */
  createStore?: CreateOfflineStore;

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

type Timer = number | { unref?: () => void };

/**
 * Wraps a transport and stores and retries events when they fail to send.
 *
 * @param createTransport The transport to wrap.
 */
export function makeOfflineTransport<TO>(
  createTransport: (options: TO) => Transport,
): (options: TO & OfflineTransportOptions) => Transport {
  return options => {
    const transport = createTransport(options);
    const store = options.createStore ? options.createStore(options) : undefined;

    let retryDelay = START_DELAY;
    let flushTimer: Timer | undefined;

    function shouldQueue(env: Envelope, error: Error, retryDelay: number): boolean | Promise<boolean> {
      // We don't queue Session Replay envelopes because they are:
      // - Ordered and Replay relies on the response status to know when they're successfully sent.
      // - Likely to fill the queue quickly and block other events from being sent.
      // We also want to drop client reports because they can be generated when we retry sending events while offline.
      if (envelopeContainsItemType(env, ['replay_event', 'replay_recording', 'client_report'])) {
        return false;
      }

      if (options.shouldStore) {
        return options.shouldStore(env, error, retryDelay);
      }

      return true;
    }

    function flushIn(delay: number): void {
      if (!store) {
        return;
      }

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
      if (typeof flushTimer !== 'number' && flushTimer.unref) {
        flushTimer.unref();
      }
    }

    function flushWithBackOff(): void {
      if (flushTimer) {
        return;
      }

      flushIn(retryDelay);

      retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
    }

    async function send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
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
        if (store && (await shouldQueue(envelope, e as Error, retryDelay))) {
          await store.insert(envelope);
          flushWithBackOff();
          log('Error sending. Event queued', e as Error);
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
      flush: t => transport.flush(t),
    };
  };
}
