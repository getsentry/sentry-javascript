import type { Envelope, InternalBaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/types';
import { envelopeContainsItemType, logger, parseRetryAfterHeader } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

export const MIN_DELAY = 100; // 100 ms
export const START_DELAY = 5_000; // 5 seconds
const MAX_DELAY = 3.6e6; // 1 hour

export interface OfflineStore {
  push(env: Envelope): Promise<void>;
  unshift(env: Envelope): Promise<void>;
  shift(): Promise<Envelope | undefined>;
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
  function log(...args: unknown[]): void {
    DEBUG_BUILD && logger.info('[Offline]:', ...args);
  }

  return options => {
    const transport = createTransport(options);

    if (!options.createStore) {
      throw new Error('No `createStore` function was provided');
    }

    const store = options.createStore(options);

    let retryDelay = START_DELAY;
    let flushTimer: Timer | undefined;

    function shouldQueue(env: Envelope, error: Error, retryDelay: number): boolean | Promise<boolean> {
      // We want to drop client reports because they can be generated when we retry sending events while offline.
      if (envelopeContainsItemType(env, ['client_report'])) {
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

        const found = await store.shift();
        if (found) {
          log('Attempting to send previously queued event');

          // We should to update the sent_at timestamp to the current time.
          found[0].sent_at = new Date().toISOString();

          void send(found, true).catch(e => {
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

    async function send(envelope: Envelope, isRetry: boolean = false): Promise<TransportMakeRequestResponse> {
      // We queue all replay envelopes to avoid multiple replay envelopes being sent at the same time. If one fails, we
      // need to retry them in order.
      if (!isRetry && envelopeContainsItemType(envelope, ['replay_event', 'replay_recording'])) {
        await store.push(envelope);
        flushIn(MIN_DELAY);
        return {};
      }

      try {
        const result = await transport.send(envelope);

        let delay = MIN_DELAY;

        if (result) {
          // If there's a retry-after header, use that as the next delay.
          if (result.headers && result.headers['retry-after']) {
            delay = parseRetryAfterHeader(result.headers['retry-after']);
          } else if (result.headers && result.headers['x-sentry-rate-limits']) {
            delay = 60_000; // 60 seconds
          } // If we have a server error, return now so we don't flush the queue.
          else if ((result.statusCode || 0) >= 400) {
            return result;
          }
        }

        flushIn(delay);
        retryDelay = START_DELAY;
        return result;
      } catch (e) {
        if (await shouldQueue(envelope, e as Error, retryDelay)) {
          // If this envelope was a retry, we want to add it to the front of the queue so it's retried again first.
          if (isRetry) {
            await store.unshift(envelope);
          } else {
            await store.push(envelope);
          }
          flushWithBackOff();
          log('Error sending. Event queued.', e as Error);
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
