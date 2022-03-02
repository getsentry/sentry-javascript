import { Envelope, EventStatus, SentryRequestType } from '@sentry/types';
import {
  eventStatusFromHttpCode,
  makePromiseBuffer,
  PromiseBuffer,
  rejectedSyncPromise,
  resolvedSyncPromise,
  serializeEnvelope,
  SentryError,
} from '@sentry/utils';

export type TransportRequest = {
  body: string;
  type: SentryRequestType;
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

export interface BaseTransportOptions {
  // url to send the event
  // transport does not care about dsn specific - client should take care of
  // parsing and figuring that out
  url: string;
  headers?: Record<string, string>;
  bufferSize?: number; // make transport buffer size configurable
}

export interface BrowserTransportOptions extends BaseTransportOptions {
  // options to pass into fetch request
  fetchParams: Record<string, string>;
  sendClientReports?: boolean;
}

export interface NodeTransportOptions extends BaseTransportOptions {
  // Set a HTTP proxy that should be used for outbound requests.
  httpProxy?: string;
  // Set a HTTPS proxy that should be used for outbound requests.
  httpsProxy?: string;
  // HTTPS proxy certificates path
  caCerts?: string;
}

interface INewTransport {
  send(request: Envelope, type: SentryRequestType): PromiseLike<TransportResponse>;
  flush(timeout: number): PromiseLike<boolean>;
}

/**
 * Heavily based on Kamil's work in
 * https://github.com/getsentry/sentry-javascript/blob/v7-dev/packages/transport-base/src/transport.ts
 */
export abstract class BaseTransport implements INewTransport {
  protected readonly _buffer: PromiseBuffer<TransportResponse>;
  private readonly _rateLimits: Record<string, number> = {};

  public constructor(protected readonly _options: BaseTransportOptions) {
    this._buffer = makePromiseBuffer(this._options.bufferSize || 30);
  }

  /**  */
  public send(envelope: Envelope, type: SentryRequestType): PromiseLike<TransportResponse> {
    const request: TransportRequest = {
      // I'm undecided if the type API should work like this
      // though we are a little stuck with this because of how
      // minimal the envelopes implementation is
      // perhaps there is a way we can expand it?
      type,
      body: serializeEnvelope(envelope),
    };

    if (isRateLimited(this._rateLimits, type)) {
      return rejectedSyncPromise(
        new SentryError(`oh no, disabled until: ${rateLimitDisableUntil(this._rateLimits, type)}`),
      );
    }

    const requestTask = (): PromiseLike<TransportResponse> =>
      this._makeRequest(request).then(({ body, headers, reason, statusCode }): PromiseLike<TransportResponse> => {
        if (headers) {
          updateRateLimits(this._rateLimits, headers);
        }

        // TODO: This is the happy path!
        const status = eventStatusFromHttpCode(statusCode);
        if (status === 'success') {
          return resolvedSyncPromise({ status });
        }

        return rejectedSyncPromise(new SentryError(body || reason || 'Unknown transport error'));
      });

    return this._buffer.add(requestTask);
  }

  /** */
  public flush(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }

  // Each is up to each transport implementation to determine how to make a request -> return an according response
  // `TransportMakeRequestResponse` is different than `TransportResponse` because the client doesn't care about
  // these extra details
  protected abstract _makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse>;
}

/** */
function createTransport<O extends BaseTransportOptions>(
  options: O,
  makeRequest: (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>,
): INewTransport {
  const buffer = makePromiseBuffer(options.bufferSize || 30);
  const rateLimits: Record<string, number> = {};

  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope, type: SentryRequestType): PromiseLike<TransportResponse> {
    const request: TransportRequest = {
      // I'm undecided if the type API should work like this
      // though we are a little stuck with this because of how
      // minimal the envelopes implementation is
      // perhaps there is a way we can expand it?
      type,
      body: serializeEnvelope(envelope),
    };

    if (isRateLimited(rateLimits, type)) {
      return rejectedSyncPromise(new SentryError(`oh no, disabled until: ${rateLimitDisableUntil(rateLimits, type)}`));
    }

    const requestTask = (): PromiseLike<TransportResponse> =>
      makeRequest(request).then(({ body, headers, reason, statusCode }): PromiseLike<TransportResponse> => {
        if (headers) {
          updateRateLimits(rateLimits, headers);
        }

        // TODO: This is the happy path!
        const status = eventStatusFromHttpCode(statusCode);
        if (status === 'success') {
          return resolvedSyncPromise({ status });
        }

        return rejectedSyncPromise(new SentryError(body || reason || 'Unknown transport error'));
      });

    return buffer.add(requestTask);
  }

  return { send, flush };
}
