import { Backend, DSN, Options, SentryError } from '@sentry/core';
import { addBreadcrumb, captureEvent } from '@sentry/minimal';
import { SentryEvent, SentryResponse } from '@sentry/types';
import { Raven } from './raven';
import { HTTPSTransport, HTTPTransport } from './transports';

/** Extension to the Function type. */
interface FunctionExt extends Function {
  __SENTRY_CAPTURE__?: boolean;
}

/** Prepares an event so it can be send with raven-js. */
function normalizeEvent(ravenEvent: any): SentryEvent {
  const event = ravenEvent;
  // tslint:disable-next-line:no-unsafe-any
  if (ravenEvent.exception && !ravenEvent.exception.values) {
    // tslint:disable-next-line:no-unsafe-any
    event.exception = { values: ravenEvent.exception };
  }
  return event as SentryEvent;
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

    Raven.config(dsn, this.options);

    // We need to leave it here for now, as we are skipping `install` call,
    // due to integrations migration
    // TODO: Remove it once we fully migrate our code
    const { onFatalError } = this.options;
    if (onFatalError) {
      Raven.onFatalError = onFatalError;
    }
    Raven.installed = true;

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
        callback(normalizeEvent(event));
      } else {
        captureEvent(normalizeEvent(event));
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
  public async sendEvent(event: SentryEvent): Promise<SentryResponse> {
    let dsn: DSN;

    if (!this.options.dsn) {
      throw new SentryError('Cannot sendEvent without a valid DSN');
    } else {
      dsn = new DSN(this.options.dsn);
    }

    const transportOptions = this.options.transportOptions
      ? this.options.transportOptions
      : { dsn };

    const transport = this.options.transport
      ? new this.options.transport({ dsn })
      : dsn.protocol === 'http'
        ? new HTTPTransport(transportOptions)
        : new HTTPSTransport(transportOptions);

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
}
