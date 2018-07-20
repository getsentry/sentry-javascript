import { SentryEvent, StackFrame } from '@sentry/types';
import {
  limitObjectDepthToSize,
  serializeKeysToEventMessage,
} from '@sentry/utils/object';
import * as md5proxy from 'md5';
import {
  StackFrame as TraceKitStackFrame,
  StackTrace as TraceKitStackTrace,
} from './tracekit';

// Workaround for Rollup issue with overloading namespaces
// https://github.com/rollup/rollup/issues/1267#issuecomment-296395734
const md5 = (md5proxy as any).default || md5proxy;

const STACKTRACE_LIMIT = 50;

/** TODO */
export function getEventOptionsFromPlainObject(
  exception: Error,
): {
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
    message: `Non-Error exception captured with keys: ${serializeKeysToEventMessage(
      exceptionKeys,
    )}`,
  };
}

export function eventFromStacktrace(
  stacktrace: TraceKitStackTrace,
): SentryEvent {
  const frames = prepareFramesForEvent(stacktrace.stack);
  // const prefixedMessage =
  //   (stack.name ? stack.name + ': ' : '') + (stack.message || '');
  const transaction =
    stacktrace.url ||
    (stacktrace.stack && stacktrace.stack[0].url) ||
    '<unknown>';

  const ex = {
    stacktrace: { frames },
    type: stacktrace.name,
    value: stacktrace.message,
  };

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
export function prepareFramesForEvent(
  stack: TraceKitStackFrame[],
): StackFrame[] {
  if (!stack) {
    return [];
  }

  const topFrameUrl = stack[0].url;

  return (
    stack
      // TODO: REMOVE ME, TESTING ONLY
      // Remove frames that don't have filename, colno and lineno.
      // Things like `new Promise` called by generated code
      // eg. async/await from regenerator
      .filter(frame => {
        if (frame.url.includes('packages/browser/build/bundle.min.js')) {
          return false;
        }
        if (frame.url === '<anonymous>' && !frame.column && !frame.line) {
          return false;
        }
        return true;
      })
      .map(
        (frame: TraceKitStackFrame): StackFrame => ({
          // normalize the frames data
          // Case when we don't have any information about the error
          // E.g. throwing a string or raw object, instead of an `Error` in Firefox
          // Generating synthetic error doesn't add any value here
          //
          // We should probably somehow let a user know that they should fix their code

          // e.g. frames captured via captureMessage throw
          // for (let j = 0; j < options.trimHeadFrames && j < frames.length; j++) {
          // frames[j].in_app = false;
          // }

          // TODO: This has to be fixed
          // determine if an exception came from outside of our app
          // first we check the global includePaths list.
          // Now we check for fun, if the function name is Raven or TraceKit
          // finally, we do a last ditch effort and check for raven.min.js
          // normalized.in_app = !(
          //   /(Sentry|TraceKit)\./.test(normalized.function) ||
          //   /raven\.(min\.)?js$/.test(normalized.filename)
          // );
          colno: frame.column,
          filename: frame.url || topFrameUrl,
          function: frame.func || '?',
          in_app: true,
          lineno: frame.line,
        }),
      )
      .slice(0, STACKTRACE_LIMIT)
  );
}
