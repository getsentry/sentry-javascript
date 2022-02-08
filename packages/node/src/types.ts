import { Options } from '@sentry/types';

/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeClient for more information.
 */
export interface NodeOptions extends Options {
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

  /** Sets the number of context lines for each frame when loading a file. */
  frameContextLines?: number;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;
}
