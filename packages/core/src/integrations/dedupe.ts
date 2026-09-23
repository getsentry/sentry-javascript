import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import type { Event } from '../types/event';
import type { Exception } from '../types/exception';
import type { IntegrationFn } from '../types/integration';
import { debug } from '../utils/debug-logger';
import { getFramesFromEvent } from '../utils/stacktrace';

const INTEGRATION_NAME = 'Dedupe' as const;

const _dedupeIntegration = (() => {
  let previousEvent: Event | undefined;

  return {
    name: INTEGRATION_NAME,
    processEvent(currentEvent) {
      // We want to ignore any non-error type events, e.g. transactions or replays
      // These should never be deduped, and also not be compared against as _previousEvent.
      if (currentEvent.type) {
        return currentEvent;
      }

      // Juuust in case something goes wrong
      try {
        if (_shouldDropEvent(currentEvent, previousEvent)) {
          DEBUG_BUILD && debug.warn('Event dropped due to being a duplicate of previously captured event.');
          return null;
        }
      } catch {} // eslint-disable-line no-empty

      return (previousEvent = currentEvent);
    },
  };
}) satisfies IntegrationFn;

/**
 * Deduplication filter.
 */
export const dedupeIntegration = defineIntegration(_dedupeIntegration);

/** only exported for tests. */
export function _shouldDropEvent(currentEvent: Event, previousEvent?: Event): boolean {
  if (!previousEvent) {
    return false;
  }

  if (_isSameMessageEvent(currentEvent, previousEvent)) {
    return true;
  }

  if (_isSameExceptionEvent(currentEvent, previousEvent)) {
    return true;
  }

  return false;
}

function _isSameMessageEvent(currentEvent: Event, previousEvent: Event): boolean {
  const currentMessage = currentEvent.message;
  const previousMessage = previousEvent.message;

  // If neither event has a message property, they were both exceptions, so bail out
  if (!currentMessage && !previousMessage) {
    return false;
  }

  // If only one event has a stacktrace, but not the other one, they are not the same
  if ((currentMessage && !previousMessage) || (!currentMessage && previousMessage)) {
    return false;
  }

  if (currentMessage !== previousMessage) {
    return false;
  }

  if (!_isSameFingerprint(currentEvent, previousEvent)) {
    return false;
  }

  if (!_isSameStacktrace(currentEvent, previousEvent)) {
    return false;
  }

  return true;
}

function _isSameExceptionEvent(currentEvent: Event, previousEvent: Event): boolean {
  const previousException = _getExceptionFromEvent(previousEvent);
  const currentException = _getExceptionFromEvent(currentEvent);

  if (!previousException || !currentException) {
    return false;
  }

  if (previousException.type !== currentException.type || previousException.value !== currentException.value) {
    return false;
  }

  if (!_isSameFingerprint(currentEvent, previousEvent)) {
    return false;
  }

  if (!_isSameStacktrace(currentEvent, previousEvent)) {
    return false;
  }

  return true;
}

function _isSameStacktrace(currentEvent: Event, previousEvent: Event): boolean {
  const currentFrames = getFramesFromEvent(currentEvent);
  const previousFrames = getFramesFromEvent(previousEvent);

  // If either event is missing a stacktrace, they are the same only if neither has one
  if (!currentFrames || !previousFrames) {
    return !currentFrames && !previousFrames;
  }

  // If number of frames differ, they are not the same
  if (previousFrames.length !== currentFrames.length) {
    return false;
  }

  // Otherwise, compare the two
  for (let i = 0; i < previousFrames.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const frameA = previousFrames[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const frameB = currentFrames[i]!;

    if (
      frameA.filename !== frameB.filename ||
      frameA.lineno !== frameB.lineno ||
      frameA.colno !== frameB.colno ||
      frameA.function !== frameB.function
    ) {
      return false;
    }
  }

  return true;
}

function _isSameFingerprint(currentEvent: Event, previousEvent: Event): boolean {
  const currentFingerprint = currentEvent.fingerprint;
  const previousFingerprint = previousEvent.fingerprint;

  // If either event is missing a fingerprint, they are the same only if neither has one
  if (!currentFingerprint || !previousFingerprint) {
    return !currentFingerprint && !previousFingerprint;
  }

  // Otherwise, compare the two
  try {
    return !!(currentFingerprint.join('') === previousFingerprint.join(''));
  } catch {
    return false;
  }
}

function _getExceptionFromEvent(event: Event): Exception | undefined {
  return event.exception?.values?.[0];
}
