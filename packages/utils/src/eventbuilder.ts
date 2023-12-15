import type {
  Client,
  Event,
  EventHint,
  Exception,
  Extras,
  Hub,
  Mechanism,
  Severity,
  SeverityLevel,
  StackFrame,
  StackParser,
} from '@sentry/types';

import { isError, isPlainObject } from './is';
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

function getMessageForObject(exception: object): string {
  if ('name' in exception && typeof exception.name === 'string') {
    let message = `'${exception.name}' captured as exception`;

    if ('message' in exception && typeof exception.message === 'string') {
      message += ` with message '${exception.message}'`;
    }

    return message;
  } else if ('message' in exception && typeof exception.message === 'string') {
    return exception.message;
  } else {
    // This will allow us to group events based on top-level keys
    // which is much better than creating new group when any key/value change
    return `Object captured as exception with keys: ${extractExceptionKeysForMessage(
      exception as Record<string, unknown>,
    )}`;
  }
}

/**
 * Builds and Event from a Exception
 *
 * TODO(v8): Remove getHub fallback
 * @hidden
 */
export function eventFromUnknownInput(
  getHubOrClient: (() => Hub) | Client | undefined,
  stackParser: StackParser,
  exception: unknown,
  hint?: EventHint,
): Event {
  const client = typeof getHubOrClient === 'function' ? getHubOrClient().getClient() : getHubOrClient;

  let ex: unknown = exception;
  const providedMechanism: Mechanism | undefined =
    hint && hint.data && (hint.data as { mechanism: Mechanism }).mechanism;
  const mechanism: Mechanism = providedMechanism || {
    handled: true,
    type: 'generic',
  };

  const extras: Extras = {};

  if (!isError(exception)) {
    if (isPlainObject(exception)) {
      const normalizeDepth = client && client.getOptions().normalizeDepth;
      extras['__serialized__'] = normalizeToSize(exception as Record<string, unknown>, normalizeDepth);

      const message = getMessageForObject(exception);
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

  const event: Event = {
    exception: {
      values: [exceptionFromError(stackParser, ex as Error)],
    },
    extra: extras,
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
  stackParser: StackParser,
  message: string,
  // eslint-disable-next-line deprecation/deprecation
  level: Severity | SeverityLevel = 'info',
  hint?: EventHint,
  attachStacktrace?: boolean,
): Event {
  const event: Event = {
    event_id: hint && hint.event_id,
    level,
    message,
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

  return event;
}
