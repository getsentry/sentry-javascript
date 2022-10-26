import { ClientOptions, Options, TracePropagationTargets } from '@sentry/types';

import { NodeTransportOptions } from './transports';

export interface BaseNodeOptions {
  /** Sets an optional server name (device name) */
  serverName?: string;

  // We have this option separately in both, the node options and the browser options, so that we can have different JSDoc
  // comments, since this has different behaviour in the Browser and Node SDKs.
  /**
   * List of strings/regex controlling to which outgoing requests
   * the SDK will attach tracing headers.
   *
   * By default the SDK will attach those headers to all outgoing
   * requests. If this option is provided, the SDK will match the
   * request URL of outgoing requests against the items in this
   * array, and only attach tracing headers if a match was found.
   */
  tracePropagationTargets?: TracePropagationTargets;

  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   */
  shouldCreateSpanForRequest?(url: string): boolean;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;
}

/**
 * Configuration options for the Sentry Node SDK
 * @see @sentry/types Options for more information.
 */
export interface NodeOptions extends Options<NodeTransportOptions>, BaseNodeOptions {}

/**
 * Configuration options for the Sentry Node SDK Client class
 * @see NodeClient for more information.
 */
export interface NodeClientOptions extends ClientOptions<NodeTransportOptions>, BaseNodeOptions {}
