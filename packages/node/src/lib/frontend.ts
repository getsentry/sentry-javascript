import { FrontendBase, SdkInfo } from '@sentry/core';
import { NodeBackend, NodeOptions } from './backend';
import { Raven } from './raven';

/**
 * The Sentry Node SDK Frontend.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeFrontend extends FrontendBase<NodeBackend, NodeOptions> {
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
  protected getSdkInfo(): SdkInfo {
    return {
      name: 'sentry-node',
      version: Raven.version,
    };
  }
}
