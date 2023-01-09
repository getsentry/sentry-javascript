import { Event } from '@sentry/types';

/**
 * Returns true if we think the given event is an error originating inside of rrweb.
 */
export function isRrwebError(event: Event): boolean {
  if (event.type || !event.exception?.values?.length) {
    return false;
  }

  // Check if any exception originates from rrweb
  return event.exception.values.some(exception => {
    if (!exception.stacktrace?.frames?.length) {
      return false;
    }

    return exception.stacktrace.frames.some(frame => frame.filename?.includes('/rrweb/src/'));
  });
}
