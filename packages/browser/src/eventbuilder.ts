import { Event, EventHint, Options, Severity } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  isDOMError,
  isDOMException,
  isError,
  isErrorEvent,
  isEvent,
  isPlainObject,
  resolvedSyncPromise,
} from '@sentry/utils';

import { eventFromError, eventFromPlainObject, parseStackFrames } from './parsers';

/**
 * Creates an {@link Event} from all inputs to `captureException` and non-primitive inputs to `captureMessage`.
 * @hidden
 */
export function eventFromException(options: Options, exception: unknown, hint?: EventHint): PromiseLike<Event> {
  const syntheticException = (hint && hint.syntheticException) || undefined;
  const event = eventFromUnknownInput(exception, syntheticException, {
    attachStacktrace: options.attachStacktrace,
  });
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
  options: Options,
  message: string,
  level: Severity = Severity.Info,
  hint?: EventHint,
): PromiseLike<Event> {
  const syntheticException = (hint && hint.syntheticException) || undefined;
  const event = eventFromString(message, syntheticException, {
    attachStacktrace: options.attachStacktrace,
  });
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
  options: {
    isRejection?: boolean;
    attachStacktrace?: boolean;
  } = {},
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
      event = eventFromString(message, syntheticException, options);
      addExceptionTypeValue(event, message);
    }
    if ('code' in domException) {
      event.tags = { ...event.tags, 'DOMException.code': `${domException.code}` };
    }

    return event;
  }
  if (isError(exception as Error)) {
    // we have a real Error object, do nothing
    return eventFromError(exception as Error);
  }
  if (isPlainObject(exception) || isEvent(exception)) {
    // If it's a plain object or an instance of `Event` (the built-in JS kind, not this SDK's `Event` type), serialize
    // it manually. This will allow us to group events based on top-level keys which is much better than creating a new
    // group on any key/value change.
    const objectException = exception as Record<string, unknown>;
    event = eventFromPlainObject(objectException, syntheticException, options.isRejection);
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
  event = eventFromString(exception as string, syntheticException, options);
  addExceptionTypeValue(event, `${exception}`, undefined);
  addExceptionMechanism(event, {
    synthetic: true,
  });

  return event;
}

/**
 * @hidden
 */
export function eventFromString(
  input: string,
  syntheticException?: Error,
  options: {
    attachStacktrace?: boolean;
  } = {},
): Event {
  const event: Event = {
    message: input,
  };

  if (options.attachStacktrace && syntheticException) {
    event.stacktrace = {
      frames: parseStackFrames(syntheticException),
    };
  }

  return event;
}
