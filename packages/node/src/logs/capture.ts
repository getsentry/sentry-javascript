import { format } from 'node:util';

import type { LogSeverityLevel, Log, ParameterizedString } from '@sentry/core';
import { _INTERNAL_captureLog } from '@sentry/core';

export type CaptureLogArgs =
  | [message: ParameterizedString, attributes?: Log['attributes']]
  | [messageTemplate: string, messageParams: Array<unknown>, attributes?: Log['attributes']];

/**
 * Capture a log with the given level.
 *
 * @param level - The level of the log.
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 */
export function captureLog(level: LogSeverityLevel, ...args: CaptureLogArgs): void {
  const [messageOrMessageTemplate, paramsOrAttributes, maybeAttributes] = args;
  if (Array.isArray(paramsOrAttributes)) {
    const attributes = { ...maybeAttributes };
    attributes['sentry.message.template'] = messageOrMessageTemplate;
    paramsOrAttributes.forEach((param, index) => {
      attributes[`sentry.message.parameter.${index}`] = param;
    });
    const message = format(messageOrMessageTemplate, ...paramsOrAttributes);
    _INTERNAL_captureLog({ level, message, attributes });
  } else {
    _INTERNAL_captureLog({ level, message: messageOrMessageTemplate, attributes: paramsOrAttributes });
  }
}
