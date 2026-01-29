import { DEBUG_BUILD } from '../debug-build';
import type { EventDropReason } from '../types-hoist/clientreport';
import type { Envelope, EnvelopeItem } from '../types-hoist/envelope';
import type {
  InternalBaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequestExecutor,
} from '../types-hoist/transport';
import { debug } from '../utils/debug-logger';
import {
  createEnvelope,
  envelopeContainsItemType,
  envelopeItemTypeToDataCategory,
  forEachEnvelopeItem,
  serializeEnvelope,
} from '../utils/envelope';
import { makePromiseBuffer, type PromiseBuffer, SENTRY_BUFFER_FULL_ERROR } from '../utils/promisebuffer';
import { isRateLimited, type RateLimits, updateRateLimits } from '../utils/ratelimit';

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
      return Promise.resolve({});
    }

    const filteredEnvelope: Envelope = createEnvelope(envelope[0], filteredEnvelopeItems as (typeof envelope)[1]);

    // Creates client report for each item in an envelope
    const recordEnvelopeLoss = (reason: EventDropReason): void => {
      // Don't record outcomes for client reports - we don't want to create a feedback loop if client reports themselves fail to send
      if (envelopeContainsItemType(filteredEnvelope, ['client_report'])) {
        DEBUG_BUILD && debug.warn(`Dropping client report. Will not send outcomes (reason: ${reason}).`);
        return;
      }
      forEachEnvelopeItem(filteredEnvelope, (item, type) => {
        options.recordDroppedEvent(reason, envelopeItemTypeToDataCategory(type));
      });
    };

    const requestTask = (): PromiseLike<TransportMakeRequestResponse> =>
      makeRequest({ body: serializeEnvelope(filteredEnvelope) }).then(
        response => {
          // Handle 413 Content Too Large
          // Loss of envelope content is expected so we record a send_error client report
          // https://develop.sentry.dev/sdk/expected-features/#dealing-with-network-failures
          if (response.statusCode === 413) {
            DEBUG_BUILD &&
              debug.error(
                'Sentry responded with status code 413. Envelope was discarded due to exceeding size limits.',
              );
            recordEnvelopeLoss('send_error');
            return response;
          }

          // We don't want to throw on NOK responses, but we want to at least log them
          if (
            DEBUG_BUILD &&
            response.statusCode !== undefined &&
            (response.statusCode < 200 || response.statusCode >= 300)
          ) {
            debug.warn(`Sentry responded with status code ${response.statusCode} to sent event.`);
          }

          rateLimits = updateRateLimits(rateLimits, response);
          return response;
        },
        error => {
          recordEnvelopeLoss('network_error');
          DEBUG_BUILD && debug.error('Encountered error running transport request:', error);
          throw error;
        },
      );

    return buffer.add(requestTask).then(
      result => result,
      error => {
        if (error === SENTRY_BUFFER_FULL_ERROR) {
          DEBUG_BUILD && debug.error('Skipped sending event because buffer is full.');
          recordEnvelopeLoss('queue_overflow');
          return Promise.resolve({});
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
