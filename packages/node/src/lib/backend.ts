import {
  Backend,
  Breadcrumb,
  Context,
  Frontend,
  Options,
  SentryError,
  SentryEvent,
} from '@sentry/core';
import { Raven } from './raven';

/** Original Raven send function. */
// tslint:disable-next-line:no-unbound-method
const sendRavenEvent = Raven.send;

/** TODO */
export interface NodeOptions extends Options {
  /**
   * Whether unhandled Promise rejections should be captured or not. If true,
   * this will install an error handler and prevent the process from crashing.
   * Defaults to false.
   */
  captureUnhandledRejections?: boolean;
}

/** TODO */
export class NodeBackend implements Backend {
  /** TODO */
  private readonly frontend: Frontend;
  /** TODO */
  private breadcrumbs: Breadcrumb[] = [];
  /** TODO */
  private context: Context = {};

  /** TODO */
  public constructor(frontend: Frontend) {
    this.frontend = frontend;
  }

  /**
   * @inheritDoc
   */
  public async install(): Promise<boolean> {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.getFrontend().getDSN();
    if (!dsn) {
      throw new SentryError(
        'Invariant exception: install() must not be called when disabled',
      );
    }

    Raven.config(dsn.toString(), this.getFrontend().getOptions()).install();

    // Hook into Raven's breadcrumb mechanism. This allows us to intercept
    // both breadcrumbs created internally by Raven and pass them to the
    // Frontend first, before actually capturing them.
    Raven.captureBreadcrumb = breadcrumb => {
      this.getFrontend()
        .addBreadcrumb(breadcrumb)
        .catch(e => {
          console.error(e);
        });
    };

    // Hook into Raven's internal event sending mechanism. This allows us to
    // pass events to the frontend, before they will be sent back here for
    // actual submission.
    Raven.send = event => {
      this.getFrontend()
        .captureEvent(event)
        .catch(e => {
          console.error(e);
        });
    };

    return true;
  }

  /**
   * @inheritDoc
   */
  public async storeContext(context: Context): Promise<void> {
    this.context = { ...context };
  }

  /**
   * @inheritDoc
   */
  public async loadContext(): Promise<Context> {
    return this.context;
  }

  /**
   * @inheritDoc
   */
  // tslint:disable-next-line:prefer-function-over-method
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
  public async storeBreadcrumbs(breadcrumbs: Breadcrumb[]): Promise<void> {
    this.breadcrumbs = [...breadcrumbs];
  }

  /**
   * @inheritDoc
   */
  public async loadBreadcrumbs(): Promise<Breadcrumb[]> {
    return [...this.breadcrumbs];
  }

  /** TODO */
  private getFrontend(): Frontend {
    return this.frontend;
  }
}
