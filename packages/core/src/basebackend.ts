import { Scope } from '@sentry/hub';
import { Breadcrumb, SentryEvent, SentryEventHint, SentryResponse, Severity, Transport } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { serialize } from '@sentry/utils/object';
import { SentryError } from './error';
import { Backend, Options } from './interfaces';
import { NoopTransport } from './transports/noop';

/** A class object that can instanciate Backend objects. */
export interface BackendClass<B extends Backend, O extends Options> {
  new (options: O): B;
}

/**
 * This is the base implemention of a Backend.
 */
export abstract class BaseBackend<O extends Options> implements Backend {
  /** Options passed to the SDK. */
  protected readonly options: O;

  /** Cached transport used internally. */
  protected transport: Transport;

  /** Creates a new browser backend instance. */
  public constructor(options: O) {
    this.options = options;
    if (!this.options.dsn) {
      logger.warn('No DSN provided, backend will not do anything.');
    }
    this.transport = this.setupTransport();
  }

  /**
   * Sets up the transport so it can be used later to send requests.
   */
  protected setupTransport(): Transport {
    return new NoopTransport();
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(_exception: any, _hint?: SentryEventHint): Promise<SentryEvent> {
    throw new SentryError('Backend has to implement `eventFromException` method');
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(_message: string, _level?: Severity, _hint?: SentryEventHint): Promise<SentryEvent> {
    throw new SentryError('Backend has to implement `eventFromMessage` method');
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<SentryResponse> {
    // TODO: Remove with v5
    // tslint:disable-next-line
    if (this.transport.captureEvent) {
      // tslint:disable-next-line
      return this.transport.captureEvent(event);
    }
    // --------------------
    return this.transport.sendEvent(serialize(event));
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(_: Breadcrumb): boolean {
    return true;
  }

  /**
   * @inheritDoc
   */
  public storeScope(_: Scope): void {
    // Noop
  }

  /**
   * @inheritDoc
   */
  public getTransport(): Transport {
    return this.transport;
  }
}
