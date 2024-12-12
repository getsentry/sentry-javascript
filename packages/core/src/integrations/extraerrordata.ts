import { defineIntegration } from '../integration';
import type { Contexts, Event, EventHint, ExtendedError, IntegrationFn } from '../types-hoist';

import { DEBUG_BUILD } from '../debug-build';
import { isError, isPlainObject } from '../utils-hoist/is';
import { logger } from '../utils-hoist/logger';
import { normalize } from '../utils-hoist/normalize';
import { addNonEnumerableProperty } from '../utils-hoist/object';
import { truncate } from '../utils-hoist/string';

const INTEGRATION_NAME = 'ExtraErrorData';

interface ExtraErrorDataOptions {
  /**
   * The object depth up to which to capture data on error objects.
   */
  depth: number;

  /**
   * Whether to capture error causes. Defaults to true.
   *
   * More information: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
   */
  captureErrorCause: boolean;
}

/**
 * Extract additional data for from original exceptions.
 */
const _extraErrorDataIntegration = ((options: Partial<ExtraErrorDataOptions> = {}) => {
  const { depth = 3, captureErrorCause = true } = options;
  return {
    name: INTEGRATION_NAME,
    processEvent(event, hint, client) {
      const { maxValueLength = 250 } = client.getOptions();
      return _enhanceEventWithErrorData(event, hint, depth, captureErrorCause, maxValueLength);
    },
  };
}) satisfies IntegrationFn;

export const extraErrorDataIntegration = defineIntegration(_extraErrorDataIntegration);

function _enhanceEventWithErrorData(
  event: Event,
  hint: EventHint = {},
  depth: number,
  captureErrorCause: boolean,
  maxValueLength: number,
): Event {
  if (!hint.originalException || !isError(hint.originalException)) {
    return event;
  }
  const exceptionName = (hint.originalException as ExtendedError).name || hint.originalException.constructor.name;

  const errorData = _extractErrorData(hint.originalException as ExtendedError, captureErrorCause, maxValueLength);

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
function _extractErrorData(
  error: ExtendedError,
  captureErrorCause: boolean,
  maxValueLength: number,
): Record<string, unknown> | null {
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
      extraErrorInfo[key] = isError(value) || typeof value === 'string' ? truncate(`${value}`, maxValueLength) : value;
    }

    // Error.cause is a standard property that is non enumerable, we therefore need to access it separately.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
    if (captureErrorCause && error.cause !== undefined) {
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
  } catch (oO) {
    DEBUG_BUILD && logger.error('Unable to extract extra data from the Error object:', oO);
  }

  return null;
}
