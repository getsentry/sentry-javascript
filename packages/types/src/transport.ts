import { Envelope } from './envelope';

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
};

export type TransportMakeRequestResponse = {
  headers?: {
    [key: string]: string | null;
    'x-sentry-rate-limits': string | null;
    'retry-after': string | null;
  };
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
  send(request: Envelope): PromiseLike<void>;
  flush(timeout?: number): PromiseLike<boolean>;
}

export type TransportRequestExecutor = (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>;
