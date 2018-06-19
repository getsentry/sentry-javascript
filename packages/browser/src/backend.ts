import { Backend, DSN, Options, SentryError } from '@sentry/core';
import { addBreadcrumb, captureEvent } from '@sentry/minimal';
import { SentryEvent } from '@sentry/types';
import { supportsFetch, urlEncode } from '@sentry/utils';
import { Raven } from './raven';
import { FetchTransport, XHRTransport } from './transports';

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
      throw new SentryError(
        'Invariant exception: install() must not be called when disabled',
      );
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
  public async sendEvent(event: SentryEvent): Promise<number> {
    let dsn;

    if (!this.options.dsn) {
      throw new SentryError('Cannot sendEvent without a valid DSN');
    } else {
      dsn = new DSN(this.options.dsn);
    }

    const auth = {
      sentry_client: `raven-js/${Raven.VERSION}`,
      sentry_key: dsn.user,
      sentry_secret: '',
      sentry_version: '7',
    };

    if (dsn.pass) {
      auth.sentry_secret = dsn.pass;
    } else {
      delete auth.sentry_secret;
    }

    const lastSlash = dsn.path.lastIndexOf('/');
    const path = dsn.path.substr(1, lastSlash);

    const _globalProject = dsn.path.substr(lastSlash + 1);
    let globalServer = `//${dsn.host}${dsn.port ? `:${dsn.port}` : ''}`;

    if (dsn.protocol) {
      globalServer = `${dsn.protocol}':'${globalServer}`;
    }

    const _globalEndpoint = `${globalServer}/${path}api/${_globalProject}/store/`;

    // Auth is intentionally sent as part of query string (NOT as custom HTTP header)
    // to avoid preflight CORS requests
    const url = `${_globalEndpoint}?${urlEncode(auth)}`;

    const transport = this.options.transport
      ? this.options.transport
      : supportsFetch()
        ? new FetchTransport({ url })
        : new XHRTransport({ url });

    // tslint:disable-next-line
    debugger;

    return transport
      .send(event)
      .then((response: Response | XMLHttpRequest) => response.status)
      .catch((error: Response | XMLHttpRequest) => error.status);
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
