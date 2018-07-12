import { BaseClient } from '@sentry/core';
import { SdkInfo } from '@sentry/types';
import { NodeBackend, NodeOptions } from './backend';

/**
 * The Sentry Node SDK Client.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeClient extends BaseClient<NodeBackend, NodeOptions> {
  /**
   * Creates a new Node SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: NodeOptions) {
    super(NodeBackend, options);
  }

  /**
   * @inheritDoc
   */
  public getSdkInfo(): SdkInfo {
    return {
      name: 'sentry-node',
      version: '4.0.0-beta.8',
    };
  }
}
