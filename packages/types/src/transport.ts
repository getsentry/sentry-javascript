import type { Client } from './client';
import type { Envelope } from './envelope';
import type { TextEncoderInternal } from './textencoder';

export type TransportRequest = {
  body: string | Uint8Array;
};

export type TransportMakeRequestResponse = {
  statusCode?: number;
  headers?: {
    [key: string]: string | null;
    'x-sentry-rate-limits': string | null;
    'retry-after': string | null;
  };
};

export interface InternalBaseTransportOptions {
  bufferSize?: number;
  recordDroppedEvent: Client['recordDroppedEvent'];
  textEncoder?: TextEncoderInternal;
}

export interface BaseTransportOptions extends InternalBaseTransportOptions {
  // url to send the event
  // transport does not care about dsn specific - client should take care of
  // parsing and figuring that out
  url: string;
}

export interface Transport {
  // TODO (v8) Remove void from return as it was only retained to avoid a breaking change
  send(request: Envelope): PromiseLike<void | TransportMakeRequestResponse>;
  flush(timeout?: number): PromiseLike<boolean>;
}

export type TransportRequestExecutor = (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>;
