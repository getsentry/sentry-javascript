import { Scope } from '@sentry/hub';
import { Breadcrumb, SentryEvent, SentryEventHint, SentryResponse, Severity, Transport } from '@sentry/types';
import { SentryError } from './error';
import { Backend, Options } from './interfaces';
import { logger } from './logger';
import { RequestBuffer } from './requestbuffer';

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

  /** Creates a new browser backend instance. */
  public constructor(options: O) {
    this.options = options;
    if (!this.options.dsn) {
      logger.warn('No DSN provided, backend will not do anything.');
    }
  }

  /** Cached transport used internally. */
  protected transport?: Transport;

  /** A simple buffer holding all requests. */
  protected readonly buffer: RequestBuffer<SentryResponse> = new RequestBuffer();

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
  public async sendEvent(_event: SentryEvent): Promise<SentryResponse> {
    throw new SentryError('Backend has to implement `sendEvent` method');
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
  public getBuffer(): RequestBuffer<SentryResponse> {
    return this.buffer;
  }
}
