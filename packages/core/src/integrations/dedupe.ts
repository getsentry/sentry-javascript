import type { Event, Exception, IntegrationFn, StackFrame } from '@sentry/types';
import { logger } from '@sentry/utils';
import { defineIntegration } from '../integration';

import { DEBUG_BUILD } from '../debug-build';

const INTEGRATION_NAME = 'Dedupe';

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
          DEBUG_BUILD && logger.warn('Event dropped due to being a duplicate of previously captured event.');
          return null;
        }
      } catch (_oO) {} // eslint-disable-line no-empty

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
  let currentFrames = _getFramesFromEvent(currentEvent);
  let previousFrames = _getFramesFromEvent(previousEvent);

  // If neither event has a stacktrace, they are assumed to be the same
  if (!currentFrames && !previousFrames) {
    return true;
  }

  // If only one event has a stacktrace, but not the other one, they are not the same
  if ((currentFrames && !previousFrames) || (!currentFrames && previousFrames)) {
    return false;
  }

  currentFrames = currentFrames as StackFrame[];
  previousFrames = previousFrames as StackFrame[];

  // If number of frames differ, they are not the same
  if (previousFrames.length !== currentFrames.length) {
    return false;
  }

  // Otherwise, compare the two
  for (let i = 0; i < previousFrames.length; i++) {
    const frameA = previousFrames[i];
    const frameB = currentFrames[i];

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
  let currentFingerprint = currentEvent.fingerprint;
  let previousFingerprint = previousEvent.fingerprint;

  // If neither event has a fingerprint, they are assumed to be the same
  if (!currentFingerprint && !previousFingerprint) {
    return true;
  }

  // If only one event has a fingerprint, but not the other one, they are not the same
  if ((currentFingerprint && !previousFingerprint) || (!currentFingerprint && previousFingerprint)) {
    return false;
  }

  currentFingerprint = currentFingerprint as string[];
  previousFingerprint = previousFingerprint as string[];

  // Otherwise, compare the two
  try {
    return !!(currentFingerprint.join('') === previousFingerprint.join(''));
  } catch (_oO) {
    return false;
  }
}

function _getExceptionFromEvent(event: Event): Exception | undefined {
  return event.exception && event.exception.values && event.exception.values[0];
}

function _getFramesFromEvent(event: Event): StackFrame[] | undefined {
  const exception = event.exception;

  if (exception) {
    try {
      // @ts-expect-error Object could be undefined
      return exception.values[0].stacktrace.frames;
    } catch (_oO) {
      return undefined;
    }
  }
  return undefined;
}
