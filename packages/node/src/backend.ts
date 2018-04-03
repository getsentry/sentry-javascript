import { Backend, Frontend, Options, SentryError } from '@sentry/core';
import { addBreadcrumb, captureEvent, SentryEvent } from '@sentry/shim';
import { Raven, SendMethod } from './raven';

/** Original Raven send function. */
const sendRavenEvent = Raven.send.bind(Raven) as SendMethod;

/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeFrontend for more information.
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
  /** Handle to the SDK frontend for callbacks. */
  private readonly frontend: Frontend<NodeOptions>;

  /** Creates a new Node backend instance. */
  public constructor(frontend: Frontend<NodeOptions>) {
    this.frontend = frontend;
  }

  /**
   * @inheritDoc
   */
  public install(): boolean {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.frontend.getDSN();
    if (!dsn) {
      throw new SentryError(
        'Invariant exception: install() must not be called when disabled',
      );
    }

    Raven.config(dsn.toString(true), this.frontend.getOptions()).install();

    // There is no option for this so we have to overwrite it like this. We need
    // this in SentryElectron.
    const { onFatalError } = this.frontend.getOptions();
    if (onFatalError) {
      Raven.onFatalError = onFatalError;
    }

    // Hook into Raven's breadcrumb mechanism. This allows us to intercept both
    // breadcrumbs created internally by Raven and pass them to the Frontend
    // first, before actually capturing them.
    Raven.captureBreadcrumb = breadcrumb => {
      addBreadcrumb(breadcrumb);
    };

    // Hook into Raven's internal event sending mechanism. This allows us to
    // pass events to the frontend, before they will be sent back here for
    // actual submission.
    Raven.send = (event, callback) => {
      if (callback) {
        callback(event);
      } else {
        captureEvent(event);
      }
    };

    return true;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any): Promise<SentryEvent> {
    return new Promise<SentryEvent>(resolve => {
      Raven.captureException(exception, resolve);
    });
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string): Promise<SentryEvent> {
    return new Promise<SentryEvent>(resolve => {
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
  public storeContext(): boolean {
    return true;
  }
}
