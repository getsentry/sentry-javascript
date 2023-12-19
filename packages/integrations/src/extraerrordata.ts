import type { Contexts, Event, EventHint, ExtendedError, Integration } from '@sentry/types';
import { addNonEnumerableProperty, isError, isPlainObject, logger, normalize } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';

/** JSDoc */
interface ExtraErrorDataOptions {
  depth: number;
  captureErrorCause: boolean;
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
  public name: string;

  /** JSDoc */
  private readonly _options: ExtraErrorDataOptions;

  /**
   * @inheritDoc
   */
  public constructor(options?: Partial<ExtraErrorDataOptions>) {
    this.name = ExtraErrorData.id;

    this._options = {
      depth: 3,
      // TODO(v8): Flip this to true
      captureErrorCause: false,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: unknown, _getCurrentHub: unknown): void {
    // noop
  }

  /** @inheritDoc */
  public processEvent(event: Event, hint: EventHint): Event {
    return this.enhanceEventWithErrorData(event, hint);
  }

  /**
   * Attaches extracted information from the Error object to extra field in the Event.
   *
   * TODO (v8): Drop this public function.
   */
  public enhanceEventWithErrorData(event: Event, hint: EventHint = {}): Event {
    return _enhanceEventWithErrorData(event, hint, this._options.depth, this._options.captureErrorCause);
  }
}

function _enhanceEventWithErrorData(
  event: Event,
  hint: EventHint = {},
  depth: number,
  captureErrorCause: boolean,
): Event {
  if (!hint.originalException || !isError(hint.originalException)) {
    return event;
  }
  const exceptionName = (hint.originalException as ExtendedError).name || hint.originalException.constructor.name;

  const errorData = _extractErrorData(hint.originalException as ExtendedError, captureErrorCause);

  if (errorData) {
    const contexts: Contexts = {
      ...event.contexts,
    };

    const normalizedErrorData = normalize(errorData, depth);

    if (isPlainObject(normalizedErrorData)) {
      // We mark the error data as "already normalized" here, because we don't want other normalization procedures to
      // potentially truncate the data we just already normalized, with a certain depth setting.
      addNonEnumerableProperty(normalizedErrorData, '__sentry_skip_normalization__', true);
      contexts[exceptionName] = normalizedErrorData;
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
function _extractErrorData(error: ExtendedError, captureErrorCause: boolean): Record<string, unknown> | null {
  // We are trying to enhance already existing event, so no harm done if it won't succeed
  try {
    const nativeKeys = [
      'name',
      'message',
      'stack',
      'line',
      'column',
      'fileName',
      'lineNumber',
      'columnNumber',
      'toJSON',
    ];

    const extraErrorInfo: Record<string, unknown> = {};

    // We want only enumerable properties, thus `getOwnPropertyNames` is redundant here, as we filter keys anyway.
    for (const key of Object.keys(error)) {
      if (nativeKeys.indexOf(key) !== -1) {
        continue;
      }
      const value = error[key];
      extraErrorInfo[key] = isError(value) ? value.toString() : value;
    }

    // Error.cause is a standard property that is non enumerable, we therefore need to access it separately.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
    if (captureErrorCause && error['cause']) {
      extraErrorInfo['cause'] = isError(error['cause']) ? error['cause'].toString() : error['cause'];
    }

    // Check if someone attached `toJSON` method to grab even more properties (eg. axios is doing that)
    if (typeof error.toJSON === 'function') {
      const serializedError = error.toJSON() as Record<string, unknown>;

      for (const key of Object.keys(serializedError)) {
        const value = serializedError[key];
        extraErrorInfo[key] = isError(value) ? value.toString() : value;
      }
    }

    return extraErrorInfo;
  } catch (oO) {
    DEBUG_BUILD && logger.error('Unable to extract extra data from the Error object:', oO);
  }

  return null;
}
