import { Backend, logger, Options, SentryError } from '@sentry/core';
import { SentryEvent, SentryEventHint, SentryResponse, Severity, Status, Transport } from '@sentry/types';
import { isDOMError, isDOMException, isError, isErrorEvent, isPlainObject } from '@sentry/utils/is';
import { supportsBeacon, supportsFetch } from '@sentry/utils/supports';
import { eventFromPlainObject, eventFromStacktrace, prepareFramesForEvent } from './parsers';
import { computeStackTrace } from './tracekit';
import { BeaconTransport, FetchTransport, XHRTransport } from './transports';

/**
 * Configuration options for the Sentry Browser SDK.
 * @see BrowserClient for more information.
 */
export interface BrowserOptions extends Options {
  /**
   * A pattern for error messages which should not be sent to Sentry. By
   * default, all errors will be sent.
   */
  ignoreErrors?: Array<string | RegExp>;

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

/** The Sentry Browser SDK Backend. */
export class BrowserBackend implements Backend {
  /** Creates a new browser backend instance. */
  public constructor(private readonly options: BrowserOptions = {}) {}

  /** Cached transport used internally. */
  private transport?: Transport;

  /**
   * @inheritDoc
   */
  public install(): boolean {
    // We are only called by the client if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.options.dsn;
    if (!dsn) {
      throw new SentryError('Invariant exception: install() must not be called when disabled');
    }

    Error.stackTraceLimit = 50;

    return true;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any, hint?: SentryEventHint): Promise<SentryEvent> {
    let event;

    if (isErrorEvent(exception as ErrorEvent) && (exception as ErrorEvent).error) {
      // If it is an ErrorEvent with `error` property, extract it to get actual Error
      const ex = exception as ErrorEvent;
      exception = ex.error; // tslint:disable-line:no-parameter-reassignment
      event = eventFromStacktrace(computeStackTrace(exception as Error));
    } else if (isDOMError(exception as DOMError) || isDOMException(exception as DOMException)) {
      // If it is a DOMError or DOMException (which are legacy APIs, but still supported in some browsers)
      // then we just extract the name and message, as they don't provide anything else
      // https://developer.mozilla.org/en-US/docs/Web/API/DOMError
      // https://developer.mozilla.org/en-US/docs/Web/API/DOMException
      const ex = exception as DOMException;
      const name = ex.name || (isDOMError(ex) ? 'DOMError' : 'DOMException');
      const message = ex.message ? `${name}: ${ex.message}` : name;

      event = await this.eventFromMessage(message, undefined, hint);
    } else if (isError(exception as Error)) {
      // we have a real Error object, do nothing
      event = eventFromStacktrace(computeStackTrace(exception as Error));
    } else if (isPlainObject(exception as {}) && hint && hint.syntheticException) {
      // If it is plain Object, serialize it manually and extract options
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change
      const ex = exception as {};
      event = eventFromPlainObject(ex, hint.syntheticException);
    } else {
      // If none of previous checks were valid, then it means that
      // it's not a DOMError/DOMException
      // it's not a plain Object
      // it's not a valid ErrorEvent (one with an error property)
      // it's not an Error
      // So bail out and capture it as a simple message:
      const ex = exception as string;
      event = await this.eventFromMessage(ex, undefined, hint);
    }

    event = {
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

    return event;
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string, level?: Severity, hint?: SentryEventHint): Promise<SentryEvent> {
    const event: SentryEvent = {
      event_id: hint && hint.event_id,
      fingerprint: [message],
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

    return event;
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<SentryResponse> {
    if (!this.options.dsn) {
      logger.warn(`Event has been skipped because no DSN is configured.`);
      // We do nothing in case there is no DSN
      return { status: Status.Skipped };
    }

    if (!this.transport) {
      const transportOptions = this.options.transportOptions
        ? this.options.transportOptions
        : { dsn: this.options.dsn };

      if (this.options.transport) {
        this.transport = new this.options.transport({ dsn: this.options.dsn });
      } else if (supportsBeacon()) {
        this.transport = new BeaconTransport(transportOptions);
      } else if (supportsFetch()) {
        this.transport = new FetchTransport(transportOptions);
      } else {
        this.transport = new XHRTransport(transportOptions);
      }
    }

    return this.transport.send(event);
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(): boolean {
    return true;
  }

  /**
   * @inheritDoc
   */
  public storeScope(): void {
    // Noop
  }
}
