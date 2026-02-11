import type { Event, EventHint } from '@sentry/core';

/**
 * Returns true if we think the given event is an error originating inside of rrweb.
 */
export function isRrwebError(event: Event, hint: EventHint): boolean {
  if (event.type || !event.exception?.values?.length) {
    return false;
  }

  // @ts-expect-error this may be set by rrweb when it finds errors
  if (hint.originalException?.__rrweb__) {
    return true;
  }

  return false;
}
