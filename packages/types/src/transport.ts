import { DsnLike } from './dsn';
import { Response } from './response';

/** Transport used sending data to Sentry */
export interface Transport {
  /**
   * Sends the body to the Store endpoint in Sentry.
   *
   * @param body String body that should be sent to Sentry.
   */
  sendEvent(body: string): Promise<Response>;

  /**
   * Call this function to wait until all pending requests have been sent.
   *
   * @param timeout Number time in ms to wait until the buffer is drained.
   */
  close(timeout?: number): Promise<boolean>;
}

/** JSDoc */
export interface TransportClass<T extends Transport> {
  new (options: TransportOptions): T;
}

/** JSDoc */
export interface TransportOptions {
  [key: string]: any;
  /** Sentry DSN */
  dsn: DsnLike;
  /** Define custom headers */
  headers?: object;
  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string;
  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string;
  /** HTTPS proxy certificates path */
  caCerts?: string;
}
