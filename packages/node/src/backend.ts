import { BaseBackend, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Mechanism, Severity, Transport, TransportOptions } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  Dsn,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
  SyncPromise,
} from '@sentry/utils';

import { extractStackFromError, parseError, parseStack, prepareFramesForEvent } from './parsers';
import { HTTPSTransport, HTTPTransport } from './transports';
import { NodeOptions } from './types';

/**
 * The Sentry Node SDK Backend.
 * @hidden
 */
export class NodeBackend extends BaseBackend<NodeOptions> {
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ex: any = exception;
    const providedMechanism: Mechanism | undefined =
      hint && hint.data && (hint.data as { mechanism: Mechanism }).mechanism;
    const mechanism: Mechanism = providedMechanism || {
      handled: true,
      type: 'generic',
    };

    if (!isError(exception)) {
      if (isPlainObject(exception)) {
        // This will allow us to group events based on top-level keys
        // which is much better than creating new group when any key/value change
        const message = `Non-Error exception captured with keys: ${extractExceptionKeysForMessage(exception)}`;

        getCurrentHub().configureScope(scope => {
          scope.setExtra('__serialized__', normalizeToSize(exception as Record<string, unknown>));
        });

        ex = (hint && hint.syntheticException) || new Error(message);
        (ex as Error).message = message;
      } else {
        // This handles when someone does: `throw "something awesome";`
        // We use synthesized Error here so we can extract a (rough) stack trace.
        ex = (hint && hint.syntheticException) || new Error(exception as string);
        (ex as Error).message = exception;
      }
      mechanism.synthetic = true;
    }

    return new SyncPromise<Event>((resolve, reject) =>
      parseError(ex as Error, this._options)
        .then(event => {
          addExceptionTypeValue(event, undefined, undefined);
          addExceptionMechanism(event, mechanism);

          resolve({
            ...event,
            event_id: hint && hint.event_id,
          });
        })
        .then(null, reject),
    );
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): PromiseLike<Event> {
    const event: Event = {
      event_id: hint && hint.event_id,
      level,
      message,
    };

    return new SyncPromise<Event>(resolve => {
      if (this._options.attachStacktrace && hint && hint.syntheticException) {
        const stack = hint.syntheticException ? extractStackFromError(hint.syntheticException) : [];
        void parseStack(stack, this._options)
          .then(frames => {
            event.stacktrace = {
              frames: prepareFramesForEvent(frames),
            };
            resolve(event);
          })
          .then(null, () => {
            resolve(event);
          });
      } else {
        resolve(event);
      }
    });
  }

  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const dsn = new Dsn(this._options.dsn);

    const transportOptions: TransportOptions = {
      ...this._options.transportOptions,
      ...(this._options.httpProxy && { httpProxy: this._options.httpProxy }),
      ...(this._options.httpsProxy && { httpsProxy: this._options.httpsProxy }),
      ...(this._options.caCerts && { caCerts: this._options.caCerts }),
      dsn: this._options.dsn,
      tunnel: this._options.tunnel,
      _metadata: this._options._metadata,
    };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }
    if (dsn.protocol === 'http') {
      return new HTTPTransport(transportOptions);
    }
    return new HTTPSTransport(transportOptions);
  }
}
