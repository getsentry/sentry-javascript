import { BaseClient, Scope } from '@sentry/core';
import { Event, EventHint } from '@sentry/types';

import { ServerlessBackend, ServerlessOptions } from './backend';
import { SDK_NAME, SDK_VERSION } from './version';

/**
 * The Sentry Serverless SDK Client.
 *
 * @see ServerlessOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ServerlessClient extends BaseClient<ServerlessBackend, ServerlessOptions> {
  /**
   * Creates a new Serverless SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ServerlessOptions) {
    super(ServerlessBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
    event.platform = event.platform || 'serverless';
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/serverless',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    if (this.getOptions().serverName) {
      event.server_name = this.getOptions().serverName;
    }

    return super._prepareEvent(event, scope, hint);
  }
}
