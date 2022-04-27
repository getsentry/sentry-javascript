import {
  Envelope,
  InternalBaseTransportOptions,
  Transport,
  TransportRequest,
  TransportRequestExecutor,
  EventDropReason,
} from '@sentry/types';
import {
  isRateLimited,
  logger,
  makePromiseBuffer,
  PromiseBuffer,
  RateLimits,
  resolvedSyncPromise,
  SentryError,
  serializeEnvelope,
  updateRateLimits,
  envelopeItemTypeToDataCategory,
} from '@sentry/utils';

import { IS_DEBUG_BUILD } from '../flags';

export const DEFAULT_TRANSPORT_BUFFER_SIZE = 30;

/**
 * Creates an instance of a Sentry `Transport`
 *
 * @param options
 * @param makeRequest
 */
export function createTransport(
  options: InternalBaseTransportOptions,
  makeRequest: TransportRequestExecutor,
  buffer: PromiseBuffer<void> = makePromiseBuffer(options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE),
): Transport {
  let rateLimits: RateLimits = {};

  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope): PromiseLike<void> {
    const filteredEnvelopeItems = envelope[1].filter((envelopeItem: Envelope[1][number]) => {
      const envelopeItemType = envelopeItem[0].type;

      const itemIsRateLimited = isRateLimited(rateLimits, envelopeItemType);

      if (itemIsRateLimited && options.recordDroppedEvent) {
        options.recordDroppedEvent('ratelimit_backoff', envelopeItemTypeToDataCategory(envelopeItemType));
      }

      return !itemIsRateLimited;
    });

    if (filteredEnvelopeItems.length === 0) {
      return resolvedSyncPromise(undefined);
    }

    const filteredEvelope: Envelope = [envelope[0], filteredEnvelopeItems];

    const recordEnvelopeLoss = (reason: EventDropReason) => {
      envelope[1].forEach((envelopeItem: Envelope[1][number]) => {
        const envelopeItemType = envelopeItem[0].type;
        if (options.recordDroppedEvent) {
          options.recordDroppedEvent(reason, envelopeItemTypeToDataCategory(envelopeItemType));
        }
      });
    };

    const request: TransportRequest = {
      body: serializeEnvelope(filteredEvelope),
    };

    const requestTask = (): PromiseLike<void> =>
      makeRequest(request).then(
        ({ headers }): PromiseLike<void> => {
          if (headers) {
            rateLimits = updateRateLimits(rateLimits, headers);
          }

          return resolvedSyncPromise(undefined);
        },
        error => {
          IS_DEBUG_BUILD && logger.error('Failed while making request:', error);
          recordEnvelopeLoss('network_error');
          return resolvedSyncPromise(undefined);
        },
      );

    return buffer.add(requestTask).then(
      result => result,
      error => {
        if (error instanceof SentryError) {
          recordEnvelopeLoss('queue_overflow');
          return resolvedSyncPromise(undefined);
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
