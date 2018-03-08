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

/** Original raven send function. */
// tslint:disable-next-line:no-unbound-method
const sendRavenEvent = Raven._sendProcessedPayload;

/** TODO */
export interface BrowserOptions extends Options {
  /**
   * A pattern for error messages which should not be sent to Sentry.
   * By default, all errors will be sent.
   */
  ignoreErrors?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should not be sent to Sentry.
   * To whitelist certain errors instead, use {@link Options.whitelistUrls}.
   * By default, all errors will be sent.
   */
  ignoreUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should exclusively be sent to Sentry.
   * This is the opposite of {@link Options.ignoreUrls}.
   * By default, all errors will be sent.
   */
  whitelistUrls?: Array<string | RegExp>;

  /**
   * Defines a list source code file paths. Only errors including these paths in
   * their stack traces will be sent to Sentry.
   * By default, all errors will be sent.
   */
  includePaths?: Array<string | RegExp>;
}

/** TODO */
export class BrowserBackend implements Backend {
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
    // Client first, before actually capturing them.
    Raven.setBreadcrumbCallback(b => this.interceptRavenBreadcrumb(b));

    // Hook into Raven's internal event sending mechanism. This allows us to
    // intercept events generated by Raven in the same way as events created
    // via `SentryBrowser.captureException`. In both cases, we call
    // `Client.send` with the intercepted event, so that the client can
    // override the sending mechanism.
    Raven._sendProcessedPayload = e => {
      this.interceptRavenSend(e);
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

  /** TODO */
  private interceptRavenBreadcrumb(crumb: Breadcrumb): Breadcrumb | boolean {
    // The breadcrumb has been generated internally by Raven. We return `false`
    // to prevent Raven's default mechanism and pass it to the frontend instead.
    // The frontend can then run all callbacks and decide how to store the
    // breadcrumb. If SentryBrowser is in charge, the Client will call
    // `SentryBrowser.captureBreadcrumb` next, which will capture it (see
    // above).
    this.frontend.addBreadcrumb(crumb).catch(e => {
      console.error(e);
    });

    return false;
  }

  /** TODO */
  private interceptRavenSend(event: SentryEvent): void {
    // Instead of sending directly with RavenJS, we pass the event to the
    // frontend, which will prepare it, pass it through callbacks and then
    // directly call sendEvent() on this backend again.
    this.getFrontend()
      .captureEvent(event)
      .catch(e => {
        console.error(e);
      });
  }
}
