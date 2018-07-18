import { Backend, DSN, Options, SentryError } from '../../core/dist';
import { addBreadcrumb, captureEvent } from '../../minimal/dist';
import { SentryEvent, SentryResponse, StackFrame } from '../../types/dist';
import { supportsFetch } from '../../utils/supports';
import { Raven } from './raven';
import {
  StackFrame as TraceKitStackFrame,
  StackTrace as TraceKitStackTrace,
} from './tracekit';
import { FetchTransport, XHRTransport } from './transports';

const STACKTRACE_LIMIT = 50;

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

  private prepareFrames(
    stackInfo: TraceKitStackTrace,
    options: {
      trimHeadFrames: number;
    } = {
      trimHeadFrames: 0,
    },
  ): StackFrame[] {
    if (stackInfo.stack && stackInfo.stack.length) {
      const frames = stackInfo.stack.map((frame: TraceKitStackFrame) =>
        this.normalizeFrame(frame, stackInfo.url),
      );

      // e.g. frames captured via captureMessage throw
      for (let j = 0; j < options.trimHeadFrames && j < frames.length; j++) {
        frames[j].in_app = false;
      }

      return frames.slice(0, STACKTRACE_LIMIT);
    } else {
      return [];
    }
  }

  /**
   * @inheritDoc
   */
  private normalizeFrame(
    frame: TraceKitStackFrame,
    stackInfoUrl: string,
  ): StackFrame {
    // normalize the frames data
    const normalized = {
      colno: frame.column,
      filename: frame.url,
      function: frame.func || '?',
      in_app: true,
      lineno: frame.line,
    };

    // Case when we don't have any information about the error
    // E.g. throwing a string or raw object, instead of an `Error` in Firefox
    // Generating synthetic error doesn't add any value here
    //
    // We should probably somehow let a user know that they should fix their code
    if (!frame.url) {
      normalized.filename = stackInfoUrl; // fallback to whole stacks url from onerror handler
    }

    // TODO: This has to be fixed
    // determine if an exception came from outside of our app
    // first we check the global includePaths list.
    // Now we check for fun, if the function name is Raven or TraceKit
    // finally, we do a last ditch effort and check for raven.min.js
    normalized.in_app = !(
      /(Sentry|TraceKit)\./.test(normalized.function) ||
      /raven\.(min\.)?js$/.test(normalized.filename)
    );

    return normalized;
  }
}
