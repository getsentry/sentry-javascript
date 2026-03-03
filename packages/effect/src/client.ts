import type { ClientOptions, Event, EventHint, Options, ParameterizedString, SeverityLevel } from '@sentry/core';
import {
  applySdkMetadata,
  Client,
  eventFromMessage as coreEventFromMessage,
  eventFromUnknownInput as coreEventFromUnknownInput,
  resolvedSyncPromise,
} from '@sentry/core';

/**
 * Configuration options for the Sentry Effect SDK.
 * @see @sentry/core Options for more information.
 */
export type EffectOptions = Options;

/**
 * Configuration options for the Sentry Effect SDK Client class.
 * @see EffectClient for more information.
 */
export type EffectClientOptions = ClientOptions;

/**
 * The Sentry Effect SDK Client.
 *
 * @see EffectOptions for documentation on configuration options.
 * @see Client for usage documentation.
 */
export class EffectClient extends Client<EffectClientOptions> {
  /**
   * Creates a new Effect SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: EffectClientOptions) {
    applySdkMetadata(options, 'effect');
    super(options);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    const event = coreEventFromUnknownInput(this, this._options.stackParser, exception, hint);
    event.level = 'error';
    return resolvedSyncPromise(event);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: ParameterizedString,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return resolvedSyncPromise(
      coreEventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace),
    );
  }
}
