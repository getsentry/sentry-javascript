import type {
  Client,
  Event,
  EventHint,
  Exception,
  Extras,
  Mechanism,
  ParameterizedString,
  SeverityLevel,
  StackFrame,
  StackParser,
} from '@sentry/types';

import { isError, isErrorEvent, isParameterizedString, isPlainObject } from './is';
import { addExceptionMechanism, addExceptionTypeValue } from './misc';
import { normalizeToSize } from './normalize';
import { extractExceptionKeysForMessage } from './object';

/**
 * Extracts stack frames from the error.stack string
 */
export function parseStackFrames(stackParser: StackParser, error: Error): StackFrame[] {
  return stackParser(error.stack || '', 1);
}

/**
 * Extracts stack frames from the error and builds a Sentry Exception
 */
export function exceptionFromError(stackParser: StackParser, error: Error): Exception {
  const exception: Exception = {
    type: error.name || error.constructor.name,
    value: error.message,
  };

  const frames = parseStackFrames(stackParser, error);
  if (frames.length) {
    exception.stacktrace = { frames };
  }

  return exception;
}

/** If a plain object has a property that is an `Error`, return this error. */
function getErrorPropertyFromObject(obj: Record<string, unknown>): Error | undefined {
  for (const prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      const value = obj[prop];
      if (value instanceof Error) {
        return value;
      }
    }
  }

  return undefined;
}

function getMessageForObject(exception: Record<string, unknown>): string {
  if ('name' in exception && typeof exception.name === 'string') {
    let message = `'${exception.name}' captured as exception`;

    if ('message' in exception && typeof exception.message === 'string') {
      message += ` with message '${exception.message}'`;
    }

    return message;
  } else if ('message' in exception && typeof exception.message === 'string') {
    return exception.message;
  }

  const keys = extractExceptionKeysForMessage(exception);

  // Some ErrorEvent instances do not have an `error` property, which is why they are not handled before
  // We still want to try to get a decent message for these cases
  if (isErrorEvent(exception)) {
    return `Event \`ErrorEvent\` captured as exception with message \`${exception.message}\``;
  }

  const className = getObjectClassName(exception);

  return `${
    className && className !== 'Object' ? `'${className}'` : 'Object'
  } captured as exception with keys: ${keys}`;
}

function getObjectClassName(obj: unknown): string | undefined | void {
  try {
    const prototype: unknown | null = Object.getPrototypeOf(obj);
    return prototype ? prototype.constructor.name : undefined;
  } catch (e) {
    // ignore errors here
  }
}

function getException(
  client: Client,
  mechanism: Mechanism,
  exception: unknown,
  hint?: EventHint,
): [Error, Extras | undefined] {
  if (isError(exception)) {
    return [exception, undefined];
  }

  // Mutate this!
  mechanism.synthetic = true;

  if (isPlainObject(exception)) {
    const normalizeDepth = client && client.getOptions().normalizeDepth;
    const extras = { ['__serialized__']: normalizeToSize(exception as Record<string, unknown>, normalizeDepth) };

    const errorFromProp = getErrorPropertyFromObject(exception);
    if (errorFromProp) {
      return [errorFromProp, extras];
    }

    const message = getMessageForObject(exception);
    const ex = (hint && hint.syntheticException) || new Error(message);
    ex.message = message;

    return [ex, extras];
  }

  // This handles when someone does: `throw "something awesome";`
  // We use synthesized Error here so we can extract a (rough) stack trace.
  const ex = (hint && hint.syntheticException) || new Error(exception as string);
  ex.message = `${exception}`;

  return [ex, undefined];
}

/**
 * Builds and Event from a Exception
 * @hidden
 */
export function eventFromUnknownInput(
  client: Client,
  stackParser: StackParser,
  exception: unknown,
  hint?: EventHint,
): Event {
  const providedMechanism: Mechanism | undefined =
    hint && hint.data && (hint.data as { mechanism: Mechanism }).mechanism;
  const mechanism: Mechanism = providedMechanism || {
    handled: true,
    type: 'generic',
  };

  const [ex, extras] = getException(client, mechanism, exception, hint);

  const event: Event = {
    exception: {
      values: [exceptionFromError(stackParser, ex)],
    },
  };

  if (extras) {
    event.extra = extras;
  }

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
  stackParser: StackParser,
  message: ParameterizedString,
  level: SeverityLevel = 'info',
  hint?: EventHint,
  attachStacktrace?: boolean,
): Event {
  const event: Event = {
    event_id: hint && hint.event_id,
    level,
  };

  if (attachStacktrace && hint && hint.syntheticException) {
    const frames = parseStackFrames(stackParser, hint.syntheticException);
    if (frames.length) {
      event.exception = {
        values: [
          {
            value: message,
            stacktrace: { frames },
          },
        ],
      };
    }
  }

  if (isParameterizedString(message)) {
    const { __sentry_template_string__, __sentry_template_values__ } = message;

    event.logentry = {
      message: __sentry_template_string__,
      params: __sentry_template_values__,
    };
    return event;
  }

  event.message = message;
  return event;
}
