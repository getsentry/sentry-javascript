import { SentryEvent, SentryException, StackFrame } from '@sentry/types';
import { limitObjectDepthToSize, serializeKeysToEventMessage } from '@sentry/utils/object';
import { includes } from '@sentry/utils/string';
import { md5 } from './md5';
import { computeStackTrace, StackFrame as TraceKitStackFrame, StackTrace as TraceKitStackTrace } from './tracekit';

const STACKTRACE_LIMIT = 50;

/** JSDoc */
export function exceptionFromStacktrace(stacktrace: TraceKitStackTrace): SentryException {
  const frames = prepareFramesForEvent(stacktrace.stack);

  const exception = {
    stacktrace: { frames },
    type: stacktrace.name,
    value: stacktrace.message,
  };

  // tslint:disable-next-line:strict-type-predicates
  if (exception.type === undefined && exception.value === '') {
    exception.value = 'Unrecoverable error caught';
  }

  return exception;
}

/** JSDoc */
export function eventFromPlainObject(exception: {}, syntheticException: Error | null): SentryEvent {
  const exceptionKeys = Object.keys(exception).sort();
  const event: SentryEvent = {
    extra: {
      __serialized__: limitObjectDepthToSize(exception),
    },
    fingerprint: [md5(exceptionKeys.join(''))],
    message: `Non-Error exception captured with keys: ${serializeKeysToEventMessage(exceptionKeys)}`,
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

/** JSDoc */
export function eventFromStacktrace(stacktrace: TraceKitStackTrace): SentryEvent {
  const exception = exceptionFromStacktrace(stacktrace);

  return {
    exception: {
      values: [exception],
    },
  };
}

/** JSDoc */
export function prepareFramesForEvent(stack: TraceKitStackFrame[]): StackFrame[] {
  if (!stack || !stack.length) {
    return [];
  }

  let localStack = stack;
  const firstFrameFunction = localStack[0].func || '';

  if (includes(firstFrameFunction, 'captureMessage') || includes(firstFrameFunction, 'captureException')) {
    localStack = localStack.slice(1);
  }

  // The frame where the crash happened, should be the last entry in the array
  return localStack
    .map(
      (frame: TraceKitStackFrame): StackFrame => ({
        colno: frame.column,
        filename: frame.url || localStack[0].url,
        function: frame.func || '?',
        in_app: true,
        lineno: frame.line,
      }),
    )
    .slice(0, STACKTRACE_LIMIT)
    .reverse();
}
