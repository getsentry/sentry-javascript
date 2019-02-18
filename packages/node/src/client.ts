import { BaseClient, Scope } from '@sentry/core';
import { Event, EventHint } from '@sentry/types';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { NodeBackend, NodeOptions } from './backend';
import { SDK_NAME, SDK_VERSION } from './version';

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
  protected prepareEvent(event: Event, scope?: Scope, hint?: EventHint): SyncPromise<Event | null> {
    event.platform = event.platform || 'node';
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/node',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    if (this.getOptions().serverName) {
      event.server_name = this.getOptions().serverName;
    }

    return super.prepareEvent(event, scope, hint);
  }
}
