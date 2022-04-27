import { EventDropReason } from './clientreport';
import { Envelope } from './envelope';

// Used in various places like Client Reports and Rate Limit Categories
export type DataCategory = 'default' | 'transaction' | 'error' | 'security' | 'attachment' | 'session' | 'internal';

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
  recordDroppedEvent?: (reason: EventDropReason, dataCategory: DataCategory) => void;
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

/**
 * Executes a transport request.
 * This function should return a rejected promise when an error occurs during transmission (ie, a network error).
 */
export type TransportRequestExecutor = (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>;
