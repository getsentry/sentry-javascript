import { Envelope } from './envelope';
import { EventStatus } from './eventstatus';

export type Outcome =
  | 'before_send'
  | 'event_processor'
  | 'network_error'
  | 'queue_overflow'
  | 'ratelimit_backoff'
  | 'sample_rate';

export type TransportCategory = 'error' | 'transaction' | 'attachment' | 'session';

export type TransportRequest = {
  body: string;
  category: TransportCategory;
};

export type TransportMakeRequestResponse = {
  headers?: {
    [key: string]: string | null;
    'x-sentry-rate-limits': string | null;
    'retry-after': string | null;
  };
  statusCode: number;
};

export type TransportResponse =
  | {
      // Status the server responded with.
      status: EventStatus;
    }
  | {
      // Event was not sent to the server with a provided reason.
      status: 'not_sent';
      /** these values directly map to @see {@link Outcome} */
      reason: 'network_error' | 'queue_overflow' | 'ratelimit_backoff'; //
    };

export interface InternalBaseTransportOptions {
  bufferSize?: number;
}

export interface BaseTransportOptions extends InternalBaseTransportOptions {
  // url to send the event
  // transport does not care about dsn specific - client should take care of
  // parsing and figuring that out
  url: string;
}

export interface Transport {
  send(request: Envelope): PromiseLike<TransportResponse>;
  flush(timeout?: number): PromiseLike<boolean>;
}

/**
 * Executes a transport request.
 * This function should return a rejected promise when an error occurs during transmission (ie, a network error).
 */
export type TransportRequestExecutor = (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>;
