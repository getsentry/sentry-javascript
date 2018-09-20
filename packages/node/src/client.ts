import { BaseClient, Scope } from '@sentry/core';
import { SentryEvent, SentryEventHint } from '@sentry/types';
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
  protected async prepareEvent(event: SentryEvent, scope?: Scope, hint?: SentryEventHint): Promise<SentryEvent | null> {
    event.platform = event.platform || 'node';
    if (this.getOptions().serverName) {
      event.server_name = this.getOptions().serverName;
    }
    return super.prepareEvent(event, scope, hint);
  }
}
