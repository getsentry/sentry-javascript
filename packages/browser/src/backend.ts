import { BaseBackend } from '@sentry/core';
import { Event, EventHint, Options, Severity, Transport } from '@sentry/types';
import { isDOMError, isDOMException, isError, isErrorEvent, isPlainObject } from '@sentry/utils/is';
import { supportsBeacon, supportsFetch } from '@sentry/utils/supports';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { addExceptionTypeValue, eventFromPlainObject, eventFromStacktrace, prepareFramesForEvent } from './parsers';
import { computeStackTrace } from './tracekit';
import { BeaconTransport, FetchTransport, XHRTransport } from './transports';

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
   * @inheritdoc
   */
  protected setupTransport(): Transport {
    if (!this.options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super.setupTransport();
    }

    const transportOptions = this.options.transportOptions ? this.options.transportOptions : { dsn: this.options.dsn };

    if (this.options.transport) {
      return new this.options.transport(transportOptions);
    } else if (supportsBeacon()) {
      return new BeaconTransport(transportOptions);
    } else if (supportsFetch()) {
      return new FetchTransport(transportOptions);
    }
    return new XHRTransport(transportOptions);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any, hint?: EventHint): SyncPromise<Event> {
    let event: Event;

    if (isErrorEvent(exception as ErrorEvent) && (exception as ErrorEvent).error) {
      // If it is an ErrorEvent with `error` property, extract it to get actual Error
      const errorEvent = exception as ErrorEvent;
      exception = errorEvent.error; // tslint:disable-line:no-parameter-reassignment
      event = eventFromStacktrace(computeStackTrace(exception as Error));
      return SyncPromise.resolve(this.buildEvent(event));
    } else if (isDOMError(exception as DOMError) || isDOMException(exception as DOMException)) {
      // If it is a DOMError or DOMException (which are legacy APIs, but still supported in some browsers)
      // then we just extract the name and message, as they don't provide anything else
      // https://developer.mozilla.org/en-US/docs/Web/API/DOMError
      // https://developer.mozilla.org/en-US/docs/Web/API/DOMException
      const domException = exception as DOMException;
      const name = domException.name || (isDOMError(domException) ? 'DOMError' : 'DOMException');
      const message = domException.message ? `${name}: ${domException.message}` : name;

      return this.eventFromMessage(message, Severity.Error, hint).then(messageEvent => {
        addExceptionTypeValue(messageEvent, message);
        return SyncPromise.resolve(this.buildEvent(messageEvent));
      });
    } else if (isError(exception as Error)) {
      // we have a real Error object, do nothing
      event = eventFromStacktrace(computeStackTrace(exception as Error));
      return SyncPromise.resolve(this.buildEvent(event));
    } else if (isPlainObject(exception as {}) && hint && hint.syntheticException) {
      // If it is plain Object, serialize it manually and extract options
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change
      const objectException = exception as {};
      event = eventFromPlainObject(objectException, hint.syntheticException);
      addExceptionTypeValue(event, 'Custom Object');
      return SyncPromise.resolve(this.buildEvent(event));
    }

    // If none of previous checks were valid, then it means that
    // it's not a DOMError/DOMException
    // it's not a plain Object
    // it's not a valid ErrorEvent (one with an error property)
    // it's not an Error
    // So bail out and capture it as a simple message:
    const stringException = exception as string;
    return this.eventFromMessage(stringException, undefined, hint).then(messageEvent => {
      addExceptionTypeValue(messageEvent, `${stringException}`);
      return SyncPromise.resolve(this.buildEvent(messageEvent));
    });
  }

  /**
   * This is an internal helper function that creates an event.
   */
  private buildEvent(event: Event, hint?: EventHint): Event {
    return {
      ...event,
      event_id: hint && hint.event_id,
      exception: {
        ...event.exception,
        mechanism: {
          handled: true,
          type: 'generic',
        },
      },
    };
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): SyncPromise<Event> {
    const event: Event = {
      event_id: hint && hint.event_id,
      level,
      message,
    };

    if (this.options.attachStacktrace && hint && hint.syntheticException) {
      const stacktrace = computeStackTrace(hint.syntheticException);
      const frames = prepareFramesForEvent(stacktrace.stack);
      event.stacktrace = {
        frames,
      };
    }

    return SyncPromise.resolve(event);
  }
}
