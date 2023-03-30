import type {
  Envelope,
  EnvelopeItem,
  EnvelopeItemType,
  Event,
  EventDropReason,
  EventItem,
  InternalBaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequestExecutor,
} from '@sentry/types';
import type { PromiseBuffer, RateLimits } from '@sentry/utils';
import {
  createEnvelope,
  envelopeItemTypeToDataCategory,
  forEachEnvelopeItem,
  isRateLimited,
  logger,
  makePromiseBuffer,
  resolvedSyncPromise,
  SentryError,
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
  buffer: PromiseBuffer<void | TransportMakeRequestResponse> = makePromiseBuffer(
    options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE,
  ),
): Transport {
  let rateLimits: RateLimits = {};
  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope): PromiseLike<void | TransportMakeRequestResponse> {
    const filteredEnvelopeItems: EnvelopeItem[] = [];

    // Drop rate limited items from envelope
    forEachEnvelopeItem(envelope, (item, type) => {
      const envelopeItemDataCategory = envelopeItemTypeToDataCategory(type);
      if (isRateLimited(rateLimits, envelopeItemDataCategory)) {
        const event: Event | undefined = getEventForEnvelopeItem(item, type);
        options.recordDroppedEvent('ratelimit_backoff', envelopeItemDataCategory, event);
      } else {
        filteredEnvelopeItems.push(item);
      }
    });

    // Skip sending if envelope is empty after filtering out rate limited events
    if (filteredEnvelopeItems.length === 0) {
      return resolvedSyncPromise();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredEnvelope: Envelope = createEnvelope(envelope[0], filteredEnvelopeItems as any);

    // Creates client report for each item in an envelope
    const recordEnvelopeLoss = (reason: EventDropReason): void => {
      forEachEnvelopeItem(filteredEnvelope, (item, type) => {
        const event: Event | undefined = getEventForEnvelopeItem(item, type);
        options.recordDroppedEvent(reason, envelopeItemTypeToDataCategory(type), event);
      });
    };

    const requestTask = (): PromiseLike<void | TransportMakeRequestResponse> =>
      makeRequest({ body: serializeEnvelope(filteredEnvelope, options.textEncoder) }).then(
        response => {
          // We don't want to throw on NOK responses, but we want to at least log them
          if (response.statusCode !== undefined && (response.statusCode < 200 || response.statusCode >= 300)) {
            __DEBUG_BUILD__ && logger.warn(`Sentry responded with status code ${response.statusCode} to sent event.`);
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
          __DEBUG_BUILD__ && logger.error('Skipped sending event because buffer is full.');
          recordEnvelopeLoss('queue_overflow');
          return resolvedSyncPromise();
        } else {
          throw error;
        }
      },
    );
  }

  // We use this to identifify if the transport is the base transport
  // TODO (v8): Remove this again as we'll no longer need it
  send.__sentry__baseTransport__ = true;

  return {
    send,
    flush,
  };
}

function getEventForEnvelopeItem(item: Envelope[1][number], type: EnvelopeItemType): Event | undefined {
  if (type !== 'event' && type !== 'transaction') {
    return undefined;
  }

  return Array.isArray(item) ? (item as EventItem)[1] : undefined;
}
