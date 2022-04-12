import { ClientOptions } from '@sentry/types';

/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeClient for more information.
 */
export interface NodeClientOptions extends ClientOptions {
  /** Sets an optional server name (device name) */
  serverName?: string;

  /** Maximum time in milliseconds to wait to drain the request queue, before the process is allowed to exit. */
  shutdownTimeout?: number;

  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string;

  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string;

  /** HTTPS proxy certificates path */
  caCerts?: string;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;
}
