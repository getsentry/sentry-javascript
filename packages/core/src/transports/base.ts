import {
  Envelope,
  InternalBaseTransportOptions,
  Transport,
  TransportCategory,
  TransportRequestExecutor,
} from '@sentry/types';
import {
  getEnvelopeType,
  isRateLimited,
  makePromiseBuffer,
  PromiseBuffer,
  RateLimits,
  resolvedSyncPromise,
  serializeEnvelope,
  updateRateLimits,
} from '@sentry/utils';

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
    const envCategory = getEnvelopeType(envelope);
    const category = envCategory === 'event' ? 'error' : (envCategory as TransportCategory);

    // Don't add to buffer if transport is already rate-limited
    if (isRateLimited(rateLimits, category)) {
      return resolvedSyncPromise();
    }

    const requestTask = (): PromiseLike<void> =>
      makeRequest({ body: serializeEnvelope(envelope) }).then(({ headers }): void => {
        if (headers) {
          rateLimits = updateRateLimits(rateLimits, headers);
        }
      });

    return buffer.add(requestTask);
  }

  return {
    send,
    flush,
  };
}
