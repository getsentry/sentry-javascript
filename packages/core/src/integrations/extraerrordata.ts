import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Integration, SentryEvent, SentryEventHint } from '@sentry/types';
import { isError } from '@sentry/utils/is';

/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: any;
}

/** Patch toString calls to return proper name for wrapped functions */
export class ExtraErrorData implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = ExtraErrorData.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'ExtraErrorData';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: SentryEvent, hint?: SentryEventHint) => {
      const self = getCurrentHub().getIntegration(ExtraErrorData);

      if (!self || !hint || !hint.originalException) {
        return event;
      }

      return this.enhanceEventWithErrorData(event, hint.originalException);
    });
  }

  /**
   * Attaches extracted information from the Error object to extra field in the SentryEvent
   */
  public enhanceEventWithErrorData(event: SentryEvent, error: Error): SentryEvent {
    const errorData = this.extractErrorData(error);

    if (errorData) {
      return {
        ...event,
        extra: {
          ...event.extra,
          ...errorData,
        },
      };
    } else {
      return event;
    }
  }

  /**
   * Extract extra information from the Error object
   */
  private extractErrorData(error: ExtendedError): { [key: string]: any } | null {
    // We are trying to enhance already existing event, so no harm done if it won't succeed
    try {
      const name = error.name || error.constructor.name;
      const errorKeys = Object.keys(error).filter(key => !(key in ['name', 'message', 'stack']));

      if (errorKeys.length) {
        const extraErrorInfo: { [key: string]: any } = {};
        for (const key of errorKeys) {
          let value = error[key];
          if (isError(value)) {
            value = (value as Error).name || (value as Error).constructor.name;
          }
          extraErrorInfo[key] = value;
        }
        return {
          [name]: extraErrorInfo,
        };
      }

      return null;
    } catch (_oO) {
      return null;
    }
  }
}
