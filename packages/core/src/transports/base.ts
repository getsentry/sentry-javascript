import { Envelope, EventStatus } from '@sentry/types';
import {
  disabledUntil,
  eventStatusFromHttpCode,
  isRateLimited,
  makePromiseBuffer,
  PromiseBuffer,
  RateLimits,
  rejectedSyncPromise,
  resolvedSyncPromise,
  serializeEnvelope,
  updateRateLimits,
} from '@sentry/utils';

export const ERROR_TRANSPORT_CATEGORY = 'error';

export const TRANSACTION_TRANSPORT_CATEGORY = 'transaction';

export const ATTACHMENT_TRANSPORT_CATEGORY = 'attachment';

export const SESSION_TRANSPORT_CATEGORY = 'session';

type TransportCategory =
  | typeof ERROR_TRANSPORT_CATEGORY
  | typeof TRANSACTION_TRANSPORT_CATEGORY
  | typeof ATTACHMENT_TRANSPORT_CATEGORY
  | typeof SESSION_TRANSPORT_CATEGORY;

export type TransportRequest = {
  body: string;
  category: TransportCategory;
};

export type TransportMakeRequestResponse = {
  body?: string;
  headers?: Record<string, string | null>;
  reason?: string;
  statusCode: number;
};

export type TransportResponse = {
  status: EventStatus;
  reason?: string;
};

interface InternalBaseTransportOptions {
  bufferSize?: number;
}

export interface BaseTransportOptions extends InternalBaseTransportOptions {
  // url to send the event
  // transport does not care about dsn specific - client should take care of
  // parsing and figuring that out
  url: string;
}

// TODO: Move into Browser Transport
export interface BrowserTransportOptions extends BaseTransportOptions {
  // options to pass into fetch request
  fetchParams: Record<string, string>;
  headers?: Record<string, string>;
  sendClientReports?: boolean;
}

// TODO: Move into Node transport
export interface NodeTransportOptions extends BaseTransportOptions {
  // Set a HTTP proxy that should be used for outbound requests.
  httpProxy?: string;
  // Set a HTTPS proxy that should be used for outbound requests.
  httpsProxy?: string;
  // HTTPS proxy certificates path
  caCerts?: string;
}

export interface NewTransport {
  // If `$` is set, we know that this is a new transport.
  // TODO(v7): Remove this as we will no longer have split between
  // old and new transports.
  $: boolean;
  send(request: Envelope, category: TransportCategory): PromiseLike<TransportResponse>;
  flush(timeout?: number): PromiseLike<boolean>;
}

export type TransportRequestExecutor = (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>;

export const DEFAULT_TRANSPORT_BUFFER_SIZE = 30;

/**
 * Creates a `NewTransport`
 *
 * @param options
 * @param makeRequest
 */
export function createTransport(
  options: InternalBaseTransportOptions,
  makeRequest: TransportRequestExecutor,
  buffer: PromiseBuffer<TransportResponse> = makePromiseBuffer(options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE),
): NewTransport {
  let rateLimits: RateLimits = {};

  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope, category: TransportCategory): PromiseLike<TransportResponse> {
    const request: TransportRequest = {
      category,
      body: serializeEnvelope(envelope),
    };

    // Don't add to buffer if transport is already rate-limited
    if (isRateLimited(rateLimits, category)) {
      return rejectedSyncPromise({
        status: 'rate_limit',
        reason: getRateLimitReason(rateLimits, category),
      });
    }

    const requestTask = (): PromiseLike<TransportResponse> =>
      makeRequest(request).then(({ body, headers, reason, statusCode }): PromiseLike<TransportResponse> => {
        const status = eventStatusFromHttpCode(statusCode);
        if (headers) {
          rateLimits = updateRateLimits(rateLimits, headers);
        }
        if (status === 'success') {
          return resolvedSyncPromise({ status, reason });
        }
        return rejectedSyncPromise({
          status,
          reason:
            reason ||
            body ||
            (status === 'rate_limit' ? getRateLimitReason(rateLimits, category) : 'Unknown transport error'),
        });
      });

    return buffer.add(requestTask);
  }

  return {
    $: true,
    send,
    flush,
  };
}

function getRateLimitReason(rateLimits: RateLimits, category: TransportCategory): string {
  return `Too many ${category} requests, backing off until: ${new Date(
    disabledUntil(rateLimits, category),
  ).toISOString()}`;
}
