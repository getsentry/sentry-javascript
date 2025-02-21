import { DEBUG_BUILD } from '../debug-build';
import type {
  Envelope,
  EnvelopeItem,
  EventDropReason,
  InternalBaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequestExecutor,
} from '../types-hoist';
import {
  createEnvelope,
  envelopeItemTypeToDataCategory,
  forEachEnvelopeItem,
  serializeEnvelope,
} from '../utils-hoist/envelope';
import { SentryError } from '../utils-hoist/error';
import { logger } from '../utils-hoist/logger';
import { type PromiseBuffer, makePromiseBuffer } from '../utils-hoist/promisebuffer';
import { type RateLimits, isRateLimited, updateRateLimits } from '../utils-hoist/ratelimit';
import { resolvedSyncPromise } from '../utils-hoist/syncpromise';

export const DEFAULT_TRANSPORT_BUFFER_SIZE = 64;

/**
 * Creates an instance of a Sentry `Transport`
 *
 * @param options
 * @param makeRequest
 */
export function createTransport(
  options: InternalBaseTransportOptions,
  makeRequest: TransportRequestExecutor,
  buffer: PromiseBuffer<TransportMakeRequestResponse> = makePromiseBuffer(
    options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE,
  ),
): Transport {
  let rateLimits: RateLimits = {};
  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
    const filteredEnvelopeItems: EnvelopeItem[] = [];

    // Drop rate limited items from envelope
    forEachEnvelopeItem(envelope, (item, type) => {
      const dataCategory = envelopeItemTypeToDataCategory(type);
      if (isRateLimited(rateLimits, dataCategory)) {
        options.recordDroppedEvent('ratelimit_backoff', dataCategory);
      } else {
        filteredEnvelopeItems.push(item);
      }
    });

    // Skip sending if envelope is empty after filtering out rate limited events
    if (filteredEnvelopeItems.length === 0) {
      return resolvedSyncPromise({});
    }

    const filteredEnvelope: Envelope = createEnvelope(envelope[0], filteredEnvelopeItems as (typeof envelope)[1]);

    // Creates client report for each item in an envelope
    const recordEnvelopeLoss = (reason: EventDropReason): void => {
      forEachEnvelopeItem(filteredEnvelope, (item, type) => {
        options.recordDroppedEvent(reason, envelopeItemTypeToDataCategory(type));
      });
    };

    const requestTask = (): PromiseLike<TransportMakeRequestResponse> =>
      makeRequest({ body: serializeEnvelope(filteredEnvelope) }).then(
        response => {
          // We don't want to throw on NOK responses, but we want to at least log them
          if (response.statusCode !== undefined && (response.statusCode < 200 || response.statusCode >= 300)) {
            DEBUG_BUILD && logger.warn(`Sentry responded with status code ${response.statusCode} to sent event.`);
          }

          rateLimits = updateRateLimits(rateLimits, response);
          return response;
        },
        error => {
          recordEnvelopeLoss('network_error');
          throw error;
        },
      );

    return buffer.add(requestTask).then(
      result => result,
      error => {
        if (error instanceof SentryError) {
          DEBUG_BUILD && logger.error('Skipped sending event because buffer is full.');
          recordEnvelopeLoss('queue_overflow');
          return resolvedSyncPromise({});
        } else {
          throw error;
        }
      },
    );
  }

  return {
    send,
    flush,
  };
}
