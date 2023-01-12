import type { Scope } from '@sentry/core';
import { BaseClient, SDK_VERSION } from '@sentry/core';
import type { ClientOptions, Event, EventHint, Severity, SeverityLevel } from '@sentry/types';

import { eventFromMessage, eventFromUnknownInput } from './eventbuilder';
import type { EdgeTransportOptions } from './transport';

export type EdgeClientOptions = ClientOptions<EdgeTransportOptions>;

/**
 * The Sentry Edge SDK Client.
 */
export class EdgeClient extends BaseClient<EdgeClientOptions> {
  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: EdgeClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.nextjs',
      packages: [
        {
          name: 'npm:@sentry/nextjs',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    super(options);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return Promise.resolve(eventFromUnknownInput(this._options.stackParser, exception, hint));
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level: Severity | SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return Promise.resolve(
      eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace),
    );
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, hint: EventHint, scope?: Scope): PromiseLike<Event | null> {
    event.platform = event.platform || 'edge';
    event.contexts = {
      ...event.contexts,
      runtime: event.contexts?.runtime || {
        name: 'edge',
      },
    };
    event.server_name = event.server_name || process.env.SENTRY_NAME;
    return super._prepareEvent(event, hint, scope);
  }
}
