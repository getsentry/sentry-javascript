import type { Event, ExtendedError, IntegrationFn } from '@sentry/types';
import { addNonEnumerableProperty, isError, isPlainObject, logger, normalize } from '@sentry/utils';
import { defineIntegration } from '../integration';

import { DEBUG_BUILD } from '../debug-build';

const INTEGRATION_NAME = 'ExtraErrorData';

interface ExtraErrorDataOptions {
  /**
   * The object depth up to which to capture data on error objects.
   *
   * Defaults to 3.
   */
  depth: number;

  /**
   * Whether to capture error causes. Defaults to true.
   *
   * More information: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
   */
  captureErrorCause: boolean;
}

const _extraErrorDataIntegration = ((options: Partial<ExtraErrorDataOptions> = {}) => {
  const { depth = 3, captureErrorCause = true } = options;
  return {
    name: INTEGRATION_NAME,
    processEvent(event, hint = {}) {
      return _enhanceEventWithErrorData(event, hint.originalException, depth, captureErrorCause);
    },
  };
}) satisfies IntegrationFn;

/**
 * Extract additional data for from original exceptions.
 */
export const extraErrorDataIntegration = defineIntegration(_extraErrorDataIntegration);

function _enhanceEventWithErrorData(
  event: Event,
  originalException: unknown | undefined,
  depth: number,
  captureErrorCause: boolean,
): Event {
  if (!originalException || !isError(originalException)) {
    return event;
  }

  const exceptionName = (originalException as ExtendedError).name || originalException.constructor.name;

  const errorData = _extractErrorData(originalException as ExtendedError, captureErrorCause);

  if (errorData) {
    const normalizedErrorData = normalize(errorData, depth);
    if (isPlainObject(normalizedErrorData)) {
      // We mark the error data as "already normalized" here, because we don't want other normalization procedures to
      // potentially truncate the data we just already normalized, with a certain depth setting.
      addNonEnumerableProperty(normalizedErrorData, '__sentry_skip_normalization__', true);

      return {
        ...event,
        contexts: {
          ...event.contexts,
          [exceptionName]: normalizedErrorData,
        },
      };
    }
  }

  return event;
}

const nativeKeys = new Set(['name', 'message', 'stack', 'line', 'column', 'fileName', 'lineNumber', 'columnNumber', 'toJSON']);

/**
 * Extract extra information from the Error object
 */
function _extractErrorData(error: ExtendedError, captureErrorCause: boolean): Record<string, unknown> | null {
  // We are trying to enhance already existing event, so no harm done if it won't succeed
  try {
    const extraErrorInfo: Record<string, unknown> = {};

    // We want only enumerable properties, thus `getOwnPropertyNames` is redundant here, as we filter keys anyway.
    for (const key of Object.keys(error)) {
      if (!nativeKeys.has(key)) {
        const value = error[key];
        extraErrorInfo[key] = isError(value) ? value.toString() : value;
      }
    }

    // Error.cause is a standard property that is non enumerable, we therefore need to access it separately.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
    if (captureErrorCause) {
      extraErrorInfo.cause = isError(error.cause) ? error.cause.toString() : error.cause;
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
  } catch (err) {
    DEBUG_BUILD && logger.error('Unable to extract extra data from the Error object:', err);
  }

  return null;
}
