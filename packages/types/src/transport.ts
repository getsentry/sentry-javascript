import { EventDropReason } from './clientreport';
import { DataCategory } from './datacategory';
import { Envelope } from './envelope';
import { TextEncoderInternal } from './textencoder';

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
  recordDroppedEvent: (reason: EventDropReason, dataCategory: DataCategory) => void;
  textEncoder?: TextEncoderInternal;
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
