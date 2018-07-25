import { SentryEvent, StackFrame } from '@sentry/types';
import { limitObjectDepthToSize, serializeKeysToEventMessage } from '@sentry/utils/object';
import * as md5proxy from 'md5';
import { StackFrame as TraceKitStackFrame, StackTrace as TraceKitStackTrace } from './tracekit';

// Workaround for Rollup issue with overloading namespaces
// https://github.com/rollup/rollup/issues/1267#issuecomment-296395734
const md5 = ((md5proxy as any).default || md5proxy) as (input: string) => string;

const STACKTRACE_LIMIT = 50;

/** TODO */
export function getEventOptionsFromPlainObject(exception: {}): {
  extra: {
    __serialized__: object;
  };
  fingerprint: [string];
  message: string;
} {
  const exceptionKeys = Object.keys(exception).sort();
  return {
    extra: {
      __serialized__: limitObjectDepthToSize(exception),
    },
    fingerprint: [md5(exceptionKeys.join(''))],
    message: `Non-Error exception captured with keys: ${serializeKeysToEventMessage(exceptionKeys)}`,
  };
}

/** TODO */
export function eventFromStacktrace(stacktrace: TraceKitStackTrace): SentryEvent {
  const frames = prepareFramesForEvent(stacktrace.stack);
  const transaction = stacktrace.url || (stacktrace.stack && stacktrace.stack[0].url) || '<unknown>';

  const ex = {
    stacktrace: { frames },
    type: stacktrace.name,
    value: stacktrace.message,
  };

  // tslint:disable-next-line:strict-type-predicates
  if (ex.type === undefined && ex.value === '') {
    ex.value = 'Unrecoverable error caught';
  }

  return {
    exception: {
      values: [ex],
    },
    transaction,
  };
}

/** TODO */
export function prepareFramesForEvent(stack: TraceKitStackFrame[]): StackFrame[] {
  if (!stack) {
    return [];
  }

  let localStack = stack;
  const firstFrameFunction = localStack[0].func || '';

  // TODO: This could be smarter
  if (firstFrameFunction.includes('captureMessage') || firstFrameFunction.includes('captureException')) {
    localStack = localStack.slice(1);
  }

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
    .slice(0, STACKTRACE_LIMIT);
}
