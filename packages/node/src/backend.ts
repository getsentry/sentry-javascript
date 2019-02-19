import { BaseBackend, Dsn, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Options, Severity, Transport } from '@sentry/types';
import { isError, isPlainObject } from '@sentry/utils/is';
import { normalizeToSize } from '@sentry/utils/object';
import { keysToEventMessage } from '@sentry/utils/string';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { createHash } from 'crypto';
import { extractStackFromError, parseError, parseStack, prepareFramesForEvent } from './parsers';
import { HTTPSTransport, HTTPTransport } from './transports';

/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeClient for more information.
 */
export interface NodeOptions extends Options {
  [key: string]: any;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(error: Error): void;

  /** Sets an optional server name (device name) */
  serverName?: string;

  /** Maximum time to wait to drain the request queue, before the process is allowed to exit. */
  shutdownTimeout?: number;

  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string;

  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string;

  /** HTTPS proxy certificates path */
  caCerts?: string;

  /** Sets the number of context lines for each frame when loading a file. */
  frameContextLines?: number;
}

/**
 * The Sentry Node SDK Backend.
 * @hidden
 */
export class NodeBackend extends BaseBackend<NodeOptions> {
  /**
   * @inheritdoc
   */
  protected setupTransport(): Transport {
    if (!this.options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super.setupTransport();
    }

    const dsn = new Dsn(this.options.dsn);

    const transportOptions = this.options.transportOptions || { dsn };
    const clientOptions = ['httpProxy', 'httpsProxy', 'caCerts'];

    for (const option of clientOptions) {
      if (this.options[option] || transportOptions[option]) {
        transportOptions[option] = transportOptions[option] || this.options[option];
      }
    }

    if (this.options.transport) {
      return new this.options.transport(transportOptions);
    } else if (dsn.protocol === 'http') {
      return new HTTPTransport(transportOptions);
    } else {
      return new HTTPSTransport(transportOptions);
    }
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any, hint?: EventHint): SyncPromise<Event> {
    let ex: any = exception;

    if (!isError(exception)) {
      if (isPlainObject(exception)) {
        // This will allow us to group events based on top-level keys
        // which is much better than creating new group when any key/value change
        const keys = Object.keys(exception as {}).sort();
        const message = `Non-Error exception captured with keys: ${keysToEventMessage(keys)}`;

        getCurrentHub().configureScope(scope => {
          scope.setExtra('__serialized__', normalizeToSize(exception as {}));
          scope.setFingerprint([
            createHash('md5')
              .update(keys.join(''))
              .digest('hex'),
          ]);
        });

        ex = (hint && hint.syntheticException) || new Error(message);
        (ex as Error).message = message;
      } else {
        // This handles when someone does: `throw "something awesome";`
        // We use synthesized Error here so we can extract a (rough) stack trace.
        ex = (hint && hint.syntheticException) || new Error(exception as string);
      }
    }

    return new SyncPromise<Event>(resolve =>
      parseError(ex as Error, this.options).then(event => {
        resolve({
          ...event,
          event_id: hint && hint.event_id,
        });
      }),
    );
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): SyncPromise<Event> {
    const event: Event = {
      event_id: hint && hint.event_id,
      level,
      message,
    };

    return new SyncPromise<Event>(resolve => {
      if (this.options.attachStacktrace && hint && hint.syntheticException) {
        const stack = hint.syntheticException ? extractStackFromError(hint.syntheticException) : [];
        parseStack(stack, this.options).then(frames => {
          event.stacktrace = {
            frames: prepareFramesForEvent(frames),
          };
          resolve(event);
        });
      } else {
        resolve(event);
      }
    });
  }
}
