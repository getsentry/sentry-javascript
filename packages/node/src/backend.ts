import { BaseBackend, Dsn, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Mechanism, Options, Severity, Transport } from '@sentry/types';
import { isError, isPlainObject } from '@sentry/utils/is';
import { addExceptionTypeValue } from '@sentry/utils/misc';
import { normalizeToSize } from '@sentry/utils/object';
import { keysToEventMessage } from '@sentry/utils/string';
import { SyncPromise } from '@sentry/utils/syncpromise';
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
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const dsn = new Dsn(this._options.dsn);

    const transportOptions = this._options.transportOptions || { dsn };
    const clientOptions = ['httpProxy', 'httpsProxy', 'caCerts'];

    for (const option of clientOptions) {
      if (this._options[option] || transportOptions[option]) {
        transportOptions[option] = transportOptions[option] || this._options[option];
      }
    }

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
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
    const mechanism: Mechanism = {
      handled: true,
      type: 'generic',
    };
    if (!isError(exception)) {
      if (isPlainObject(exception)) {
        // This will allow us to group events based on top-level keys
        // which is much better than creating new group when any key/value change
        const keys = Object.keys(exception as {}).sort();
        const message = `Non-Error exception captured with keys: ${keysToEventMessage(keys)}`;

        getCurrentHub().configureScope(scope => {
          scope.setExtra('__serialized__', normalizeToSize(exception as {}));
        });

        ex = (hint && hint.syntheticException) || new Error(message);
        (ex as Error).message = message;
      } else {
        // This handles when someone does: `throw "something awesome";`
        // We use synthesized Error here so we can extract a (rough) stack trace.
        ex = (hint && hint.syntheticException) || new Error(exception as string);
      }
      mechanism.synthetic = true;
    }

    return new SyncPromise<Event>(resolve =>
      parseError(ex as Error, this._options).then(event => {
        addExceptionTypeValue(event, undefined, undefined, mechanism);
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
      if (this._options.attachStacktrace && hint && hint.syntheticException) {
        const stack = hint.syntheticException ? extractStackFromError(hint.syntheticException) : [];
        parseStack(stack, this._options).then(frames => {
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
