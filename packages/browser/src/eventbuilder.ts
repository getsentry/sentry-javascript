import { Event, EventHint, Exception, Severity, StackFrame } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  createStackParser,
  extractExceptionKeysForMessage,
  isDOMError,
  isDOMException,
  isError,
  isErrorEvent,
  isEvent,
  isPlainObject,
  normalizeToSize,
  resolvedSyncPromise,
} from '@sentry/utils';

import {
  chromeStackParser,
  geckoStackParser,
  opera10StackParser,
  opera11StackParser,
  winjsStackParser,
} from './stack-parsers';

/**
 * This function creates an exception from an TraceKitStackTrace
 * @param stacktrace TraceKitStackTrace that will be converted to an exception
 * @hidden
 */
export function exceptionFromError(ex: Error): Exception {
  // Get the frames first since Opera can lose the stack if we touch anything else first
  const frames = parseStackFrames(ex);

  const exception: Exception = {
    type: ex && ex.name,
    value: extractMessage(ex),
  };

  if (frames.length) {
    exception.stacktrace = { frames };
  }

  if (exception.type === undefined && exception.value === '') {
    exception.value = 'Unrecoverable error caught';
  }

  return exception;
}

/**
 * @hidden
 */
export function eventFromPlainObject(
  exception: Record<string, unknown>,
  syntheticException?: Error,
  isUnhandledRejection?: boolean,
): Event {
  const event: Event = {
    exception: {
      values: [
        {
          type: isEvent(exception) ? exception.constructor.name : isUnhandledRejection ? 'UnhandledRejection' : 'Error',
          value: `Non-Error ${
            isUnhandledRejection ? 'promise rejection' : 'exception'
          } captured with keys: ${extractExceptionKeysForMessage(exception)}`,
        },
      ],
    },
    extra: {
      __serialized__: normalizeToSize(exception),
    },
  };

  if (syntheticException) {
    const frames = parseStackFrames(syntheticException);
    if (frames.length) {
      event.stacktrace = { frames };
    }
  }

  return event;
}

/**
 * @hidden
 */
export function eventFromError(ex: Error): Event {
  return {
    exception: {
      values: [exceptionFromError(ex)],
    },
  };
}

/** Parses stack frames from an error */
export function parseStackFrames(ex: Error & { framesToPop?: number; stacktrace?: string }): StackFrame[] {
  // Access and store the stacktrace property before doing ANYTHING
  // else to it because Opera is not very good at providing it
  // reliably in other circumstances.
  const stacktrace = ex.stacktrace || ex.stack || '';

  const popSize = getPopSize(ex);

  try {
    return createStackParser(
      opera10StackParser,
      opera11StackParser,
      chromeStackParser,
      winjsStackParser,
      geckoStackParser,
    )(stacktrace, popSize);
  } catch (e) {
    // no-empty
  }

  return [];
}

// Based on our own mapping pattern - https://github.com/getsentry/sentry/blob/9f08305e09866c8bd6d0c24f5b0aabdd7dd6c59c/src/sentry/lang/javascript/errormapping.py#L83-L108
const reactMinifiedRegexp = /Minified React error #\d+;/i;

function getPopSize(ex: Error & { framesToPop?: number }): number {
  if (ex) {
    if (typeof ex.framesToPop === 'number') {
      return ex.framesToPop;
    }

    if (reactMinifiedRegexp.test(ex.message)) {
      return 1;
    }
  }

  return 0;
}

/**
 * There are cases where stacktrace.message is an Event object
 * https://github.com/getsentry/sentry-javascript/issues/1949
 * In this specific case we try to extract stacktrace.message.error.message
 */
function extractMessage(ex: Error & { message: { error?: Error } }): string {
  const message = ex && ex.message;
  if (!message) {
    return 'No error message';
  }
  if (message.error && typeof message.error.message === 'string') {
    return message.error.message;
  }
  return message;
}

/**
 * Creates an {@link Event} from all inputs to `captureException` and non-primitive inputs to `captureMessage`.
 * @hidden
 */
export function eventFromException(
  exception: unknown,
  hint?: EventHint,
  attachStacktrace?: boolean,
): PromiseLike<Event> {
  const syntheticException = (hint && hint.syntheticException) || undefined;
  const event = eventFromUnknownInput(exception, syntheticException, attachStacktrace);
  addExceptionMechanism(event); // defaults to { type: 'generic', handled: true }
  event.level = Severity.Error;
  if (hint && hint.event_id) {
    event.event_id = hint.event_id;
  }
  return resolvedSyncPromise(event);
}

/**
 * Builds and Event from a Message
 * @hidden
 */
export function eventFromMessage(
  message: string,
  level: Severity = Severity.Info,
  hint?: EventHint,
  attachStacktrace?: boolean,
): PromiseLike<Event> {
  const syntheticException = (hint && hint.syntheticException) || undefined;
  const event = eventFromString(message, syntheticException, attachStacktrace);
  event.level = level;
  if (hint && hint.event_id) {
    event.event_id = hint.event_id;
  }
  return resolvedSyncPromise(event);
}

/**
 * @hidden
 */
export function eventFromUnknownInput(
  exception: unknown,
  syntheticException?: Error,
  attachStacktrace?: boolean,
  isUnhandledRejection?: boolean,
): Event {
  let event: Event;

  if (isErrorEvent(exception as ErrorEvent) && (exception as ErrorEvent).error) {
    // If it is an ErrorEvent with `error` property, extract it to get actual Error
    const errorEvent = exception as ErrorEvent;
    return eventFromError(errorEvent.error as Error);
  }

  // If it is a `DOMError` (which is a legacy API, but still supported in some browsers) then we just extract the name
  // and message, as it doesn't provide anything else. According to the spec, all `DOMExceptions` should also be
  // `Error`s, but that's not the case in IE11, so in that case we treat it the same as we do a `DOMError`.
  //
  // https://developer.mozilla.org/en-US/docs/Web/API/DOMError
  // https://developer.mozilla.org/en-US/docs/Web/API/DOMException
  // https://webidl.spec.whatwg.org/#es-DOMException-specialness
  if (isDOMError(exception as DOMError) || isDOMException(exception as DOMException)) {
    const domException = exception as DOMException;

    if ('stack' in (exception as Error)) {
      event = eventFromError(exception as Error);
    } else {
      const name = domException.name || (isDOMError(domException) ? 'DOMError' : 'DOMException');
      const message = domException.message ? `${name}: ${domException.message}` : name;
      event = eventFromString(message, syntheticException, attachStacktrace);
      addExceptionTypeValue(event, message);
    }
    if ('code' in domException) {
      event.tags = { ...event.tags, 'DOMException.code': `${domException.code}` };
    }

    return event;
  }
  if (isError(exception)) {
    // we have a real Error object, do nothing
    return eventFromError(exception);
  }
  if (isPlainObject(exception) || isEvent(exception)) {
    // If it's a plain object or an instance of `Event` (the built-in JS kind, not this SDK's `Event` type), serialize
    // it manually. This will allow us to group events based on top-level keys which is much better than creating a new
    // group on any key/value change.
    const objectException = exception as Record<string, unknown>;
    event = eventFromPlainObject(objectException, syntheticException, isUnhandledRejection);
    addExceptionMechanism(event, {
      synthetic: true,
    });
    return event;
  }

  // If none of previous checks were valid, then it means that it's not:
  // - an instance of DOMError
  // - an instance of DOMException
  // - an instance of Event
  // - an instance of Error
  // - a valid ErrorEvent (one with an error property)
  // - a plain Object
  //
  // So bail out and capture it as a simple message:
  event = eventFromString(exception as string, syntheticException, attachStacktrace);
  addExceptionTypeValue(event, `${exception}`, undefined);
  addExceptionMechanism(event, {
    synthetic: true,
  });

  return event;
}

/**
 * @hidden
 */
export function eventFromString(input: string, syntheticException?: Error, attachStacktrace?: boolean): Event {
  const event: Event = {
    message: input,
  };

  if (attachStacktrace && syntheticException) {
    const frames = parseStackFrames(syntheticException);
    if (frames.length) {
      event.stacktrace = { frames };
    }
  }

  return event;
}
