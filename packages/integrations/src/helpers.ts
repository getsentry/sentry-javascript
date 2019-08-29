import { Event, StackFrame } from '@sentry/types';

/**
 * Extract frames from the Event, independent of it's shape
 */
export function getFramesFromEvent(event: Event): StackFrame[] | undefined {
  if (event.exception) {
    try {
      // @ts-ignore
      return event.exception.values[0].stacktrace.frames;
    } catch (_oO) {
      return undefined;
    }
    // tslint:disable:deprecation
  } else if (event.stacktrace) {
    return event.stacktrace.frames;
    // tslint:enable:deprecation
  } else if (event.threads) {
    try {
      // @ts-ignore
      return event.threads[0].stacktrace.frames;
    } catch (_oO) {
      return undefined;
    }
  }
  return undefined;
}
