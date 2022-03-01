import { EventStatus, SentryRequestType, TransportOptions, DsnLike } from '@sentry/types';

export type TransportRequest<T> = {
  body: T;
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

interface INewTransport {
  sendRequest<T = string>(request: TransportRequest<T>): PromiseLike<TransportResponse>;
  flush(timeout: number): PromiseLike<boolean>;
}

export type TransportOptions = {
  dsn: string;
  /** Set a HTTP proxy that should be used for outbound requests. */
  proxy?: string;
  /** HTTPS proxy certificates path */
  caCerts?: string;
  /** Fetch API init parameters */
  credentials?: string;
  headers?: Record<string, string>;
  bufferSize?: number;
};

/** JSDoc */
export interface BaseTransportOptions {
  /** Sentry DSN */
  dsn: DsnLike;
  /** Define custom headers */
  headers?: { [key: string]: string };
  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string; // ONLY USED BY NODE SDK
  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string; // ONLY USED BY NODE SDK
  /** HTTPS proxy certificates path */
  caCerts?: string; // ONLY USED BY NODE SDK
  /** Fetch API init parameters */
  fetchParameters?: { [key: string]: string }; // ONLY USED BY BROWSER SDK
  /** The envelope tunnel to use. */
  tunnel?: string;
  /** Send SDK Client Reports. Enabled by default. */
  sendClientReports?: boolean; // ONLY USED BY BROWSER SDK ATM
  /**
   * Set of metadata about the SDK that can be internally used to enhance envelopes and events,
   * and provide additional data about every request.
   * */
  _metadata?: SdkMetadata;
}

/**
 *
 */
export abstract class BaseTransport implements INewTransport {
  public constructor(protected readonly _options: TransportOptions) {}

  protected abstract _makeRequest<T = string>(request: TransportRequest<T>): PromiseLike<TransportMakeRequestResponse>;
}
