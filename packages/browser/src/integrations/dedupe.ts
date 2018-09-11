import { logger } from '@sentry/core';
import { getCurrentHub, Scope } from '@sentry/hub';
import { Integration, SentryEvent, SentryException, StackFrame } from '@sentry/types';

/** Deduplication filter */
export class Dedupe implements Integration {
  /**
   * @inheritDoc
   */
  private previousEvent?: SentryEvent;

  /**
   * @inheritDoc
   */
  public name: string = 'Dedupe';

  /**
   * @inheritDoc
   */
  public install(): void {
    getCurrentHub().configureScope((scope: Scope) => {
      scope.addEventProcessor(async (event: SentryEvent) => {
        // Juuust in case something goes wrong
        try {
          if (this.shouldDropEvent(event)) {
            return null;
          }
        } catch (_oO) {
          return (this.previousEvent = event);
        }

        return (this.previousEvent = event);
      });
    });
  }

  /** JSDoc */
  public shouldDropEvent(event: SentryEvent): boolean {
    if (!this.previousEvent) {
      return false;
    }

    if (this.isSameMessage(event)) {
      logger.warn(
        `Event dropped due to being a duplicate of previous event (same message).\n  Event: ${event.event_id}`,
      );
      return true;
    }

    if (this.isSameException(event)) {
      logger.warn(
        `Event dropped due to being a duplicate of previous event (same exception).\n  Event: ${event.event_id}`,
      );
      return true;
    }

    if (this.isSameStacktrace(event)) {
      logger.warn(
        `Event dropped due to being a duplicate of previous event (same stacktrace).\n  Event: ${event.event_id}`,
      );
      return true;
    }

    if (this.isSameFingerprint(event)) {
      logger.warn(
        `Event dropped due to being a duplicate of previous event (same fingerprint).\n  Event: ${event.event_id}`,
      );
      return true;
    }

    return false;
  }

  /** JSDoc */
  private isSameMessage(event: SentryEvent): boolean {
    if (!this.previousEvent) {
      return false;
    }
    return !!(event.message && this.previousEvent.message && event.message === this.previousEvent.message);
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
  private isSameStacktrace(event: SentryEvent): boolean {
    if (!this.previousEvent) {
      return false;
    }

    const previousFrames = this.getFramesFromEvent(this.previousEvent);
    const currentFrames = this.getFramesFromEvent(event);

    if (!previousFrames || !currentFrames || previousFrames.length !== currentFrames.length) {
      return false;
    }

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
  private isSameException(event: SentryEvent): boolean {
    if (!this.previousEvent) {
      return false;
    }

    const previousException = this.getExceptionFromEvent(this.previousEvent);
    const currentException = this.getExceptionFromEvent(event);

    if (!previousException || !currentException) {
      return false;
    }

    if (previousException.type !== currentException.type || previousException.value !== currentException.value) {
      return false;
    }

    return this.isSameStacktrace(event);
  }

  /** JSDoc */
  private isSameFingerprint(event: SentryEvent): boolean {
    if (!this.previousEvent) {
      return false;
    }

    return Boolean(event.fingerprint && this.previousEvent.fingerprint) &&
      JSON.stringify(event.fingerprint) === JSON.stringify(this.previousEvent.fingerprint)
  }
}
