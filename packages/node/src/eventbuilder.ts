import { getCurrentHub } from '@sentry/hub';
import { Event, EventHint, Mechanism, Options, Severity } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
  SyncPromise,
} from '@sentry/utils';

import { extractStackFromError, parseError, parseStack, prepareFramesForEvent } from './parsers';

/**
 * Builds and Event from a Exception
 * @hidden
 */
export function eventFromException(options: Options, exception: unknown, hint?: EventHint): PromiseLike<Event> {
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
      (ex as Error).message = exception as string;
    }
    mechanism.synthetic = true;
  }

  return new SyncPromise<Event>((resolve, reject) =>
    parseError(ex as Error, options)
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
 * Builds and Event from a Message
 * @hidden
 */
export function eventFromMessage(
  options: Options,
  message: string,
  level: Severity = 'info' as Severity,
  hint?: EventHint,
): PromiseLike<Event> {
  const event: Event = {
    event_id: hint && hint.event_id,
    level,
    message,
  };

  return new SyncPromise<Event>(resolve => {
    if (options.attachStacktrace && hint && hint.syntheticException) {
      const stack = hint.syntheticException ? extractStackFromError(hint.syntheticException) : [];
      void parseStack(stack, options)
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
