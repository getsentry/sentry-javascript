import {
  Envelope,
  InternalBaseTransportOptions,
  Transport,
  TransportCategory,
  TransportRequest,
  TransportRequestExecutor,
  TransportResponse,
} from '@sentry/types';
import {
  disabledUntil,
  eventStatusFromHttpCode,
  getEnvelopeType,
  isRateLimited,
  logger,
  makePromiseBuffer,
  PromiseBuffer,
  RateLimits,
  resolvedSyncPromise,
  SentryError,
  serializeEnvelope,
  updateRateLimits,
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
  buffer: PromiseBuffer<TransportResponse> = makePromiseBuffer(options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE),
): Transport {
  let rateLimits: RateLimits = {};

  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope): PromiseLike<TransportResponse> {
    const envCategory = getEnvelopeType(envelope); // TODO(PR): Fix getting type from envelope - it's not that simple
    const category = envCategory === 'event' ? 'error' : (envCategory as TransportCategory);
    const request: TransportRequest = {
      category, // TODO(PR): remove
      body: serializeEnvelope(envelope),
    };

    // Don't add to buffer if transport is already rate-limited
    if (isRateLimited(rateLimits, category)) {
      IS_DEBUG_BUILD &&
        logger.info(
          `Too many ${category} requests, backing off until: ${new Date(
            disabledUntil(rateLimits, category),
          ).toISOString()}`,
        );

      return resolvedSyncPromise({
        status: 'not_sent',
        reason: 'ratelimit_backoff',
      });
    }

    const requestTask = (): PromiseLike<TransportResponse> =>
      makeRequest(request).then(
        ({ headers, statusCode }): PromiseLike<TransportResponse> => {
          const status = eventStatusFromHttpCode(statusCode);
          if (headers) {
            rateLimits = updateRateLimits(rateLimits, headers);
          }

          return resolvedSyncPromise({ status });
        },
        error => {
          IS_DEBUG_BUILD && logger.error('Failed while making request:', error);
          return resolvedSyncPromise({
            status: 'not_sent',
            reason: 'network_error',
          });
        },
      );

    return buffer.add(requestTask).then(
      result => result,
      error => {
        if (error instanceof SentryError) {
          return resolvedSyncPromise({
            status: 'not_sent',
            reason: 'queue_overflow',
          });
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
