import { BaseBackend } from '@sentry/core';
import { Event, EventHint, Options, Severity, Transport } from '@sentry/types';
import { addExceptionMechanism, supportsFetch, SyncPromise } from '@sentry/utils';

import { eventFromString, eventFromUnknownInput } from './eventbuilder';
import { FetchTransport, XHRTransport } from './transports';

/**
 * Configuration options for the Sentry Browser SDK.
 * @see BrowserClient for more information.
 */
export interface BrowserOptions extends Options {
  /**
   * A pattern for error URLs which should not be sent to Sentry.
   * To whitelist certain errors instead, use {@link Options.whitelistUrls}.
   * By default, all errors will be sent.
   */
  blacklistUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should exclusively be sent to Sentry.
   * This is the opposite of {@link Options.blacklistUrls}.
   * By default, all errors will be sent.
   */
  whitelistUrls?: Array<string | RegExp>;
}

/**
 * The Sentry Browser SDK Backend.
 * @hidden
 */
export class BrowserBackend extends BaseBackend<BrowserOptions> {
  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const transportOptions = {
      ...this._options.transportOptions,
      dsn: this._options.dsn,
    };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }
    if (supportsFetch()) {
      return new FetchTransport(transportOptions);
    }
    return new XHRTransport(transportOptions);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    const syntheticException = (hint && hint.syntheticException) || undefined;
    const event = eventFromUnknownInput(exception, syntheticException, {
      attachStacktrace: this._options.attachStacktrace,
    });
    addExceptionMechanism(event, {
      handled: true,
      type: 'generic',
    });
    event.level = Severity.Error;
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return SyncPromise.resolve(event);
  }
  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): PromiseLike<Event> {
    const syntheticException = (hint && hint.syntheticException) || undefined;
    const event = eventFromString(message, syntheticException, {
      attachStacktrace: this._options.attachStacktrace,
    });
    event.level = level;
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return SyncPromise.resolve(event);
  }
}
