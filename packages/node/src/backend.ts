import { Backend, Frontend, Options, SentryError } from '@sentry/core';
import { addBreadcrumb, SentryEvent } from '@sentry/shim';
import { Raven, SendMethod } from './raven';

/** Default callback used when catching unhandled exceptions with Raven. */
const DEFAULT_CALLBACK = (e: any) => {
  if (e) {
    console.error(e);
  }
};

/** Original Raven send function. */
const sendRavenEvent = Raven.send.bind(Raven) as SendMethod;

/** Extension to the Function type. */
interface FunctionExt extends Function {
  __SENTRY_CAPTURE__?: boolean;
}

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

    const { onFatalError } = this.frontend.getOptions();
    Raven.config(dsn.toString(true), this.frontend.getOptions()).install(
      onFatalError,
    );

    // Hook into Raven's breadcrumb mechanism. This allows us to intercept both
    // breadcrumbs created internally by Raven and pass them to the Frontend
    // first, before actually capturing them.
    Raven.captureBreadcrumb = breadcrumb => {
      addBreadcrumb(breadcrumb);
    };

    // Hook into Raven's internal event sending mechanism. This allows us to
    // pass events to the frontend, before they will be sent back here for
    // actual submission.
    Raven.send = (event, callback = DEFAULT_CALLBACK) => {
      if (callback && (callback as FunctionExt).__SENTRY_CAPTURE__) {
        callback(event);
      } else {
        // TODO: Implemen callback-based version of captureEvent in @sentry/shim
        this.frontend
          .captureEvent(event)
          .then(() => {
            callback(undefined);
          })
          .catch(callback);
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
  public storeContext(): boolean {
    return true;
  }
}
