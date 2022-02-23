import { getCurrentHub } from '@sentry/hub';
import { Event, EventHint, Exception, Mechanism, Options, Severity, StackFrame } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  createStackParser,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
} from '@sentry/utils';

import { node } from './stack-parser';

/**
 * Extracts stack frames from the error.stack string
 */
export function extractStackFromError(error: Error): StackFrame[] {
  return createStackParser(node(require))(error.stack || '');
}

/**
 * Extracts stack frames from the error and builds a Sentry Exception
 */
export function exceptionFromError(error: Error): Exception {
  const exception: Exception = {
    type: error.name || error.constructor.name,
    value: error.message,
  };

  const frames = extractStackFromError(error);
  if (frames.length) {
    exception.stacktrace = { frames };
  }

  return exception;
}

/**
 * Builds and Event from a Exception
 * @hidden
 */
export function eventFromError(exception: unknown, hint?: EventHint): Event {
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

  const event = {
    exception: {
      values: [exceptionFromError(ex as Error)],
    },
  };

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
    const frames = extractStackFromError(hint.syntheticException);
    if (frames.length) {
      event.stacktrace = { frames };
    }
  }

  return event;
}
