import { getCurrentHub } from '@sentry/hub';
import { Event, EventHint, Mechanism, Options, Severity } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
} from '@sentry/utils';

import { extractStackFromError, parseError, parseStack, prepareFramesForEvent } from './parsers';

/**
 * Builds and Event from a Exception
 * @hidden
 */
export function eventFromException(exception: unknown, hint?: EventHint): Event {
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

  const event = parseError(ex as Error);
  addExceptionTypeValue(event, undefined, undefined);
  addExceptionMechanism(event, mechanism);

  return {
    ...event,
    event_id: hint && hint.event_id,
  };
}

/**
 * Builds and Event from a Message
 * @hidden
 */
export function eventFromMessage(
  options: Options,
  message: string,
  level: Severity = Severity.Info,
  hint?: EventHint,
): Event {
  const event: Event = {
    event_id: hint && hint.event_id,
    level,
    message,
  };

  if (options.attachStacktrace && hint && hint.syntheticException) {
    const stack = hint.syntheticException ? extractStackFromError(hint.syntheticException) : [];
    const frames = parseStack(stack);

    event.stacktrace = {
      frames: prepareFramesForEvent(frames),
    };
  }

  return event;
}
