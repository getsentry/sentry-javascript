import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Integration, SentryEvent, SentryException, StackFrame } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { getEventDescription } from '@sentry/utils/misc';

/** Deduplication filter */
export class Dedupe implements Integration {
  /**
   * @inheritDoc
   */
  private previousEvent?: SentryEvent;

  /**
   * @inheritDoc
   */
  public name: string = Dedupe.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Dedupe';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (currentEvent: SentryEvent) => {
      const self = getCurrentHub().getIntegration(Dedupe);
      if (self) {
        // Juuust in case something goes wrong
        try {
          if (self.shouldDropEvent(currentEvent, self.previousEvent)) {
            return null;
          }
        } catch (_oO) {
          return (self.previousEvent = currentEvent);
        }

        return (self.previousEvent = currentEvent);
      }
      return currentEvent;
    });
  }

  /** JSDoc */
  public shouldDropEvent(currentEvent: SentryEvent, previousEvent?: SentryEvent): boolean {
    if (!previousEvent) {
      return false;
    }

    if (this.isSameMessageEvent(currentEvent, previousEvent)) {
      logger.warn(
        `Event dropped due to being a duplicate of previous event (same message).\nEvent: ${getEventDescription(
          currentEvent,
        )}`,
      );
      return true;
    }

    if (this.isSameExceptionEvent(currentEvent, previousEvent)) {
      logger.warn(
        `Event dropped due to being a duplicate of previous event (same exception).\nEvent: ${getEventDescription(
          currentEvent,
        )}`,
      );
      return true;
    }

    return false;
  }

  /** JSDoc */
  private isSameMessageEvent(currentEvent: SentryEvent, previousEvent: SentryEvent): boolean {
    const currentMessage = currentEvent.message;
    const previousMessage = previousEvent.message;

    // If no event has a message, they were both exceptions, so bail out
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

    if (!this.isSameFingerprint(currentEvent, previousEvent)) {
      return false;
    }

    if (!this.isSameStacktrace(currentEvent, previousEvent)) {
      return false;
    }

    return true;
  }

  /** JSDoc */
  private getFramesFromEvent(event: SentryEvent): StackFrame[] | undefined {
    const exception = event.exception;

    if (exception) {
      try {
        // @ts-ignore
        return exception.values[0].stacktrace.frames;
      } catch (_oO) {
        return undefined;
      }
    } else if (event.stacktrace) {
      return event.stacktrace.frames;
    } else {
      return undefined;
    }
  }

  /** JSDoc */
  private isSameStacktrace(currentEvent: SentryEvent, previousEvent: SentryEvent): boolean {
    let currentFrames = this.getFramesFromEvent(currentEvent);
    let previousFrames = this.getFramesFromEvent(previousEvent);

    // If no event has a fingerprint, they are assumed to be the same
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

  /** JSDoc */
  private getExceptionFromEvent(event: SentryEvent): SentryException | undefined {
    return event.exception && event.exception.values && event.exception.values[0];
  }

  /** JSDoc */
  private isSameExceptionEvent(currentEvent: SentryEvent, previousEvent: SentryEvent): boolean {
    const previousException = this.getExceptionFromEvent(previousEvent);
    const currentException = this.getExceptionFromEvent(currentEvent);

    if (!previousException || !currentException) {
      return false;
    }

    if (previousException.type !== currentException.type || previousException.value !== currentException.value) {
      return false;
    }

    if (!this.isSameFingerprint(currentEvent, previousEvent)) {
      return false;
    }

    if (!this.isSameStacktrace(currentEvent, previousEvent)) {
      return false;
    }

    return true;
  }

  /** JSDoc */
  private isSameFingerprint(currentEvent: SentryEvent, previousEvent: SentryEvent): boolean {
    let currentFingerprint = currentEvent.fingerprint;
    let previousFingerprint = previousEvent.fingerprint;

    // If no event has a fingerprint, they are assumed to be the same
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
}
