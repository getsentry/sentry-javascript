import { Backend, DSN, Options, SentryError } from '@sentry/core';
import { getCurrentHub } from '@sentry/hub';
import { SentryEvent, SentryEventHint, SentryResponse, Severity, Transport } from '@sentry/types';
import { isError, isPlainObject } from '@sentry/utils/is';
import { limitObjectDepthToSize, serializeKeysToEventMessage } from '@sentry/utils/object';
import * as md5 from 'md5';
import { extractStackFromError, parseError, parseStack, prepareFramesForEvent } from './parsers';
import { HTTPSTransport, HTTPTransport } from './transports';

/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeClient for more information.
 */
export interface NodeOptions extends Options {
  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;

  /** Sets an optional server name (device name) */
  serverName?: string;
}

/** The Sentry Node SDK Backend. */
export class NodeBackend implements Backend {
  /** Creates a new Node backend instance. */
  public constructor(private readonly options: NodeOptions = {}) {}

  /** Cached transport used internally. */
  private transport?: Transport;

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any, hint?: SentryEventHint): Promise<SentryEvent> {
    let ex: any = exception;

    if (!isError(exception)) {
      if (isPlainObject(exception)) {
        // This will allow us to group events based on top-level keys
        // which is much better than creating new group when any key/value change
        const keys = Object.keys(exception as {}).sort();
        const message = `Non-Error exception captured with keys: ${serializeKeysToEventMessage(keys)}`;

        getCurrentHub().configureScope(scope => {
          scope.setExtra('__serialized__', limitObjectDepthToSize(exception as {}));
          scope.setFingerprint([md5(keys.join(''))]);
        });

        ex = (hint && hint.syntheticException) || new Error(message);
        (ex as Error).message = message;
      } else {
        // This handles when someone does: `throw "something awesome";`
        // We use synthesized Error here so we can extract a (rough) stack trace.
        ex = (hint && hint.syntheticException) || new Error(exception as string);
      }
    }

    const event: SentryEvent = await parseError(ex as Error);

    return {
      ...event,
      event_id: hint && hint.event_id,
    };
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string, level?: Severity, hint?: SentryEventHint): Promise<SentryEvent> {
    const event: SentryEvent = {
      event_id: hint && hint.event_id,
      fingerprint: [message],
      level,
      message,
    };

    if (this.options.attachStacktrace && hint && hint.syntheticException) {
      const stack = hint.syntheticException ? await extractStackFromError(hint.syntheticException) : [];
      const frames = await parseStack(stack);
      event.stacktrace = {
        frames: prepareFramesForEvent(frames),
      };
    }

    return event;
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

    if (!this.transport) {
      const transportOptions = this.options.transportOptions ? this.options.transportOptions : { dsn };
      this.transport = this.options.transport
        ? new this.options.transport({ dsn })
        : dsn.protocol === 'http'
          ? new HTTPTransport(transportOptions)
          : new HTTPSTransport(transportOptions);
    }

    return this.transport.send(event);
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
