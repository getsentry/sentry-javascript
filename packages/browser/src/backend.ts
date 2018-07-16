import { Backend, DSN, Options, SentryError } from '@sentry/core';
import { addBreadcrumb, captureEvent } from '@sentry/minimal';
import { SentryEvent, SentryResponse } from '@sentry/types';
import { isFunction, isUndefined } from '@sentry/utils/is';
import { supportsFetch } from '@sentry/utils/supports';
import { getDefaultHub } from '../../../node_modules/@sentry/hub';
import { Raven } from './raven';
import { FetchTransport, XHRTransport } from './transports';

interface SentryWrappedFunction extends Function {
  [key: string]: any;
  __sentry__?: boolean;
  __sentry_wrapper__?: SentryWrappedFunction;
  __original__?: SentryWrappedFunction;
}

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
   * A pattern for error URLs which should not be sent to Sentry. To whitelist
   * certain errors instead, use {@link Options.whitelistUrls}. By default, all
   * errors will be sent.
   */
  ignoreUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should exclusively be sent to Sentry. This
   * is the opposite of {@link Options.ignoreUrls}. By default, all errors will
   * be sent.
   */
  whitelistUrls?: Array<string | RegExp>;

  /**
   * Defines a list source code file paths. Only errors including these paths in
   * their stack traces will be sent to Sentry. By default, all errors will be
   * sent.
   */
  includePaths?: Array<string | RegExp>;
}

/** The Sentry Browser SDK Backend. */
export class BrowserBackend implements Backend {
  /** Creates a new browser backend instance. */
  public constructor(private readonly options: BrowserOptions = {}) {}

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

    Raven.config(dsn, this.options);

    // We need to leave it here for now, as we are skipping `install` call,
    // due to integrations migration
    // TODO: Remove it once we fully migrate our code
    Raven._isRavenInstalled = true;
    Error.stackTraceLimit = Raven._globalOptions.stackTraceLimit;

    // Hook into Raven's breadcrumb mechanism. This allows us to intercept both
    // breadcrumbs created internally by Raven and pass them to the Client
    // first, before actually capturing them.
    Raven.setBreadcrumbCallback(breadcrumb => {
      addBreadcrumb(breadcrumb);
      return false;
    });

    Raven._sendProcessedPayload = captureEvent;

    return true;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any): Promise<SentryEvent> {
    const originalSend = Raven._sendProcessedPayload;
    try {
      let event!: SentryEvent;
      Raven._sendProcessedPayload = evt => {
        event = evt;
      };
      Raven.captureException(exception);
      return event;
    } finally {
      Raven._sendProcessedPayload = originalSend;
    }
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string): Promise<SentryEvent> {
    const originalSend = Raven._sendProcessedPayload;
    try {
      let event!: SentryEvent;
      Raven._sendProcessedPayload = evt => {
        event = evt;
      };
      Raven.captureMessage(message);
      return event;
    } finally {
      Raven._sendProcessedPayload = originalSend;
    }
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<SentryResponse> {
    let dsn: DSN;

    if (!this.options.dsn) {
      throw new SentryError('Cannot sendEvent without a valid DSN');
    } else {
      dsn = new DSN(this.options.dsn);
    }

    const transportOptions = this.options.transportOptions ? this.options.transportOptions : { dsn };

    const transport = this.options.transport
      ? new this.options.transport({ dsn })
      : supportsFetch()
        ? new FetchTransport(transportOptions)
        : new XHRTransport(transportOptions);

    return transport.send(event);
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

  /**
   * Instruments the given function and sends an event to Sentry every time the
   * function throws an exception.
   *
   * @param fn A function to wrap.
   * @returns The wrapped function.
   */
  public wrap(
    this: BrowserBackend,
    fn: SentryWrappedFunction,
    options?: {
      deep: boolean;
      mechanism: object;
    },
    before?: SentryWrappedFunction,
  ): SentryWrappedFunction {
    try {
      // We don't wanna wrap it twice
      if (fn.__sentry__) {
        return fn;
      }
      // If this has already been wrapped in the past, return that wrapped function
      if (fn.__sentry_wrapper__) {
        return fn.__sentry_wrapper__;
      }
    } catch (e) {
      // Just accessing custom props in some Selenium environments
      // can cause a "Permission denied" exception (see raven-js#495).
      // Bail on wrapping and return the function as-is (defers to window.onerror).
      return fn;
    }

    const wrapped: SentryWrappedFunction = (...args: any[]) => {
      const deep = options && options.deep;

      if (before && isFunction(before)) {
        before.apply(this, args);
      }

      // Recursively wrap all of a function's arguments that are
      // functions themselves.
      let i = args.length;
      while (i--) {
        args[i] = deep ? this.wrap(args[i], options) : args[i];
      }

      try {
        // Attempt to invoke user-land function
        // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
        //       means Raven caught an error invoking your application code. This is
        //       expected behavior and NOT indicative of a bug with Raven.js.
        return fn.apply(this, args);
      } catch (ex) {
        // TODO: Get back _ignoreNextOnError() call
        // this._ignoreNextOnError();
        getDefaultHub().withScope(async () => {
          getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
            ...event,
            ...(options && options.mechanism),
          }));

          getDefaultHub().captureException(ex);
        });
        throw ex;
      }
    };

    for (const property in fn) {
      if (Object.prototype.hasOwnProperty.call(fn, property)) {
        wrapped[property] = fn[property];
      }
    }

    wrapped.prototype = fn.prototype;
    fn.__sentry_wrapper__ = wrapped;

    // Signal that this function has been wrapped/filled already
    // for both debugging and to prevent it to being wrapped/filled twice
    wrapped.__sentry__ = true;
    wrapped.__original__ = fn;

    return wrapped;
  }
}
