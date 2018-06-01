import { Backend, DSN, Options, SentryError } from '@sentry/core';
import { addBreadcrumb, captureEvent } from '@sentry/shim';
import { SentryEvent } from '@sentry/types';
import {
  HTTPSTransport,
  HTTPTransport,
  Raven,
  SendMethod,
  Transport,
} from './raven';

/** Original Raven send function. */
const sendRavenEvent = Raven.send.bind(Raven) as SendMethod;

/** Extension to the Function type. */
interface FunctionExt extends Function {
  __SENTRY_CAPTURE__?: boolean;
}

/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeClient for more information.
 */
export interface NodeOptions extends Options {
  /**
   * Whether unhandled Promise rejections should be captured or not. If true,
   * this will install an error handler and prevent the process from crashing.
   * Defaults to false.
   */
  captureUnhandledRejections?: boolean;

  /**
   * Enables/disables automatic collection of breadcrumbs. Possible values are:
   *
   *  - `false`: all automatic breadcrumb collection disabled (default)
   *  - `true`: all automatic breadcrumb collection enabled
   *  - A dictionary of individual breadcrumb types that can be
   *    enabled/disabled: e.g.: `{ console: true, http: false }`
   */
  autoBreadcrumbs?: { [key: string]: boolean } | boolean;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;
}

/** The Sentry Node SDK Backend. */
export class NodeBackend implements Backend {
  /** Creates a new Node backend instance. */
  public constructor(private readonly options: NodeOptions = {}) {}

  /**
   * @inheritDoc
   */
  public install(): boolean {
    // We are only called by the client if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.options.dsn;
    if (!dsn) {
      throw new SentryError(
        'Invariant exception: install() must not be called when disabled',
      );
    }

    const { onFatalError } = this.options;
    Raven.config(dsn, this.options).install(onFatalError);

    // Hook into Raven's breadcrumb mechanism. This allows us to intercept both
    // breadcrumbs created internally by Raven and pass them to the Client
    // first, before actually capturing them.
    Raven.captureBreadcrumb = breadcrumb => {
      addBreadcrumb(breadcrumb);
    };

    // Hook into Raven's internal event sending mechanism. This allows us to
    // pass events to the client, before they will be sent back here for
    // actual submission.
    Raven.send = (event, callback) => {
      if (callback && (callback as FunctionExt).__SENTRY_CAPTURE__) {
        callback(event);
      } else {
        captureEvent(event, callback);
      }
    };

    return true;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any): Promise<SentryEvent> {
    return new Promise<SentryEvent>(resolve => {
      (resolve as FunctionExt).__SENTRY_CAPTURE__ = true;
      Raven.captureException(exception, resolve);
    });
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string): Promise<SentryEvent> {
    return new Promise<SentryEvent>(resolve => {
      (resolve as FunctionExt).__SENTRY_CAPTURE__ = true;
      Raven.captureMessage(message, resolve);
    });
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<number> {
    return new Promise<number>(resolve => {
      sendRavenEvent(event, error => {
        // TODO: Check the response status code
        resolve(error ? 500 : 200);
      });
    });
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
   * Set the transport module used for submitting events.
   *
   * This can be set to modules like "http" or "https" or any other object that
   * provides a `request` method with options.
   *
   * @param transport The transport to use for submitting events.
   */
  public setTransport(transport: Transport): void {
    const dsn = this.options.dsn;
    if (!dsn) {
      return;
    }
    const dsnObject = new DSN(dsn);

    Raven.transport =
      dsnObject.protocol === 'http'
        ? new HTTPTransport({ transport })
        : new HTTPSTransport({ transport });
  }
}
