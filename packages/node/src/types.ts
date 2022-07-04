import { ClientOptions, Options } from '@sentry/types';

import { NodeTransportOptions } from './transports';

export interface BaseNodeOptions {
  /** Sets an optional server name (device name) */
  serverName?: string;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;
}

export interface AWSLambdaOptions {
  /** Set when init() is called by the Sentry AWS Lambda layer. */
  invokedByLambdaLayer?: boolean;
}

/**
 * Configuration options for the Sentry Node SDK
 * @see @sentry/types Options for more information.
 */
export interface NodeOptions extends Options<NodeTransportOptions>, BaseNodeOptions, AWSLambdaOptions {}

/**
 * Configuration options for the Sentry Node SDK Client class
 * @see NodeClient for more information.
 */
export interface NodeClientOptions extends ClientOptions<NodeTransportOptions>, BaseNodeOptions {}
