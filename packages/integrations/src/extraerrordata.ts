import { Event, EventHint, EventProcessor, ExtendedError, Hub, Integration } from '@sentry/types';
import { isError, isPlainObject, logger, normalize } from '@sentry/utils';

/** JSDoc */
interface ExtraErrorDataOptions {
  depth?: number;
}

/** Patch toString calls to return proper name for wrapped functions */
export class ExtraErrorData implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ExtraErrorData';

  /**
   * @inheritDoc
   */
  public name: string = ExtraErrorData.id;

  /**
   * @inheritDoc
   */
  public constructor(private readonly _options: ExtraErrorDataOptions = { depth: 3 }) {}

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(ExtraErrorData);
      if (!self) {
        return event;
      }
      return self.enhanceEventWithErrorData(event, hint);
    });
  }

  /**
   * Attaches extracted information from the Error object to extra field in the Event
   */
  public enhanceEventWithErrorData(event: Event, hint?: EventHint): Event {
    if (!hint || !hint.originalException || !isError(hint.originalException)) {
      return event;
    }
    const name = (hint.originalException as ExtendedError).name || hint.originalException.constructor.name;

    const errorData = this._extractErrorData(hint.originalException as ExtendedError);

    if (errorData) {
      let contexts = {
        ...event.contexts,
      };

      const normalizedErrorData = normalize(errorData, this._options.depth);
      if (isPlainObject(normalizedErrorData)) {
        contexts = {
          ...event.contexts,
          [name]: {
            ...normalizedErrorData,
          },
        };
      }

      return {
        ...event,
        contexts,
      };
    }

    return event;
  }

  /**
   * Extract extra information from the Error object
   */
  private _extractErrorData(error: ExtendedError): { [key: string]: unknown } | null {
    let result = null;
    // We are trying to enhance already existing event, so no harm done if it won't succeed
    try {
      const nativeKeys = ['name', 'message', 'stack', 'line', 'column', 'fileName', 'lineNumber', 'columnNumber'];
      const errorKeys = Object.getOwnPropertyNames(error).filter(key => nativeKeys.indexOf(key) === -1);

      if (errorKeys.length) {
        const extraErrorInfo: { [key: string]: unknown } = {};
        for (const key of errorKeys) {
          let value = error[key];
          if (isError(value)) {
            value = (value as Error).toString();
          }
          extraErrorInfo[key] = value;
        }
        result = extraErrorInfo;
      }
    } catch (oO) {
      logger.error('Unable to extract extra data from the Error object:', oO);
    }

    return result;
  }
}
