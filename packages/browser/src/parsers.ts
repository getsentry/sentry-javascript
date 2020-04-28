import { Event, Exception, StackFrame } from '@sentry/types';
import { extractExceptionKeysForMessage, isEvent, normalizeToSize } from '@sentry/utils';

import { computeStackTrace, StackFrame as TraceKitStackFrame, StackTrace as TraceKitStackTrace } from './tracekit';

const STACKTRACE_LIMIT = 50;

/**
 * This function creates an exception from an TraceKitStackTrace
 * @param stacktrace TraceKitStackTrace that will be converted to an exception
 * @hidden
 */
export function exceptionFromStacktrace(stacktrace: TraceKitStackTrace): Exception {
  const frames = prepareFramesForEvent(stacktrace.stack);

  const exception: Exception = {
    type: stacktrace.name,
    value: stacktrace.message,
  };

  if (frames && frames.length) {
    exception.stacktrace = { frames };
  }

  // tslint:disable-next-line:strict-type-predicates
  if (exception.type === undefined && exception.value === '') {
    exception.value = 'Unrecoverable error caught';
  }

  return exception;
}

/**
 * @hidden
 */
export function eventFromPlainObject(exception: {}, syntheticException?: Error, rejection?: boolean): Event {
  const event: Event = {
    exception: {
      values: [
        {
          type: isEvent(exception) ? exception.constructor.name : rejection ? 'UnhandledRejection' : 'Error',
          value: `Non-Error ${
            rejection ? 'promise rejection' : 'exception'
          } captured with keys: ${extractExceptionKeysForMessage(exception)}`,
        },
      ],
    },
    extra: {
      __serialized__: normalizeToSize(exception),
    },
  };

  if (syntheticException) {
    const stacktrace = computeStackTrace(syntheticException);
    const frames = prepareFramesForEvent(stacktrace.stack);
    event.stacktrace = {
      frames,
    };
  }

  return event;
}

/**
 * @hidden
 */
export function eventFromStacktrace(stacktrace: TraceKitStackTrace): Event {
  const exception = exceptionFromStacktrace(stacktrace);

  return {
    exception: {
      values: [exception],
    },
  };
}

/**
 * @hidden
 */
export function prepareFramesForEvent(stack: TraceKitStackFrame[]): StackFrame[] {
  if (!stack || !stack.length) {
    return [];
  }

  let localStack = stack;

  const firstFrameFunction = localStack[0].func || '';
  const lastFrameFunction = localStack[localStack.length - 1].func || '';

  // If stack starts with one of our API calls, remove it (starts, meaning it's the top of the stack - aka last call)
  if (firstFrameFunction.indexOf('captureMessage') !== -1 || firstFrameFunction.indexOf('captureException') !== -1) {
    localStack = localStack.slice(1);
  }

  // If stack ends with one of our internal API calls, remove it (ends, meaning it's the bottom of the stack - aka top-most call)
  if (lastFrameFunction.indexOf('sentryWrapped') !== -1) {
    localStack = localStack.slice(0, -1);
  }

  // The frame where the crash happened, should be the last entry in the array
  return localStack
    .slice(0, STACKTRACE_LIMIT)
    .map(
      (frame: TraceKitStackFrame): StackFrame => ({
        colno: frame.column === null ? undefined : frame.column,
        filename: frame.url || localStack[0].url,
        function: frame.func || '?',
        in_app: true,
        lineno: frame.line === null ? undefined : frame.line,
      }),
    )
    .reverse();
}
