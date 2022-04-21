import { DsnLike } from './dsn';
import { Envelope } from './envelope';
import { Event } from './event';
import { EventStatus } from './eventstatus';
import { SentryRequestType } from './request';
import { Response } from './response';
import { SdkMetadata } from './sdkmetadata';
import { Session, SessionAggregates } from './session';

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
  body?: string;
  headers?: {
    [key: string]: string | null;
    'x-sentry-rate-limits': string | null;
    'retry-after': string | null;
  };
  reason?: string;
  statusCode: number;
};

export type TransportResponse = {
  status: EventStatus;
  reason?: string;
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

export interface NewTransport {
  send(request: Envelope): PromiseLike<TransportResponse>;
  flush(timeout?: number): PromiseLike<boolean>;
}

export type TransportRequestExecutor = (request: TransportRequest) => PromiseLike<TransportMakeRequestResponse>;

/** Transport used sending data to Sentry */
export interface Transport {
  /**
   * Sends the event to the Store endpoint in Sentry.
   *
   * @param event Event that should be sent to Sentry.
   */
  sendEvent(event: Event): PromiseLike<Response>;

  /**
   * Sends the session to the Envelope endpoint in Sentry.
   *
   * @param session Session that should be sent to Sentry | Session Aggregates that should be sent to Sentry.
   */
  sendSession?(session: Session | SessionAggregates): PromiseLike<Response>;

  /**
   * Wait for all events to be sent or the timeout to expire, whichever comes first.
   *
   * @param timeout Maximum time in ms the transport should wait for events to be flushed. Omitting this parameter will
   *   cause the transport to wait until all events are sent before resolving the promise.
   * @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
   * still events in the queue when the timeout is reached.
   */
  close(timeout?: number): PromiseLike<boolean>;

  /**
   * Increment the counter for the specific client outcome
   */
  recordLostEvent?(type: Outcome, category: SentryRequestType): void;
}

/** JSDoc */
export type TransportClass<T extends Transport> = new (options: TransportOptions) => T;

/** JSDoc */
export interface TransportOptions {
  /** Sentry DSN */
  dsn: DsnLike;
  /** Define custom headers */
  headers?: { [key: string]: string };
  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string;
  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string;
  /** HTTPS proxy certificates path */
  caCerts?: string;
  /** Fetch API init parameters */
  fetchParameters?: { [key: string]: string };
  /** The envelope tunnel to use. */
  tunnel?: string;
  /** Send SDK Client Reports. Enabled by default. */
  sendClientReports?: boolean;
  /**
   * Set of metadata about the SDK that can be internally used to enhance envelopes and events,
   * and provide additional data about every request.
   * */
  _metadata?: SdkMetadata;
}
