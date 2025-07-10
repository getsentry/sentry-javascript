import { format } from 'node:util';
import type { Client, Log, LogSeverityLevel, ParameterizedString, Scope } from '@sentry/core';
import { _INTERNAL_captureLog } from '@sentry/core';

type CaptureLogsArgsParametrized = [
  message: ParameterizedString,
  attributes?: Log['attributes'],
  client?: Client,
  scope?: Scope,
];
type CaptureLogsArgsTemplate = [
  messageTemplate: string,
  messageParams: Array<unknown>,
  attributes?: Log['attributes'],
  client?: Client,
  scope?: Scope,
];

export type CaptureLogArgs = CaptureLogsArgsParametrized | CaptureLogsArgsTemplate;

/**
 * Capture a log with the given level.
 *
 * @param level - The level of the log.
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 */
export function captureLog(level: LogSeverityLevel, ...args: CaptureLogArgs): void {
  if (!isParametrizedArgs(args)) {
    const [messageTemplate, messageParams, messageAttributes, client, scope] = args;
    const attributes = { ...messageAttributes };
    attributes['sentry.message.template'] = messageTemplate;
    messageParams.forEach((param, index) => {
      attributes[`sentry.message.parameter.${index}`] = param;
    });
    const message = format(messageTemplate, ...messageParams);
    _INTERNAL_captureLog({ level, message, attributes }, client, scope);
  } else {
    const [message, attributes, client, scope] = args;
    _INTERNAL_captureLog({ level, message, attributes }, client, scope);
  }
}

function isParametrizedArgs(args: CaptureLogArgs): args is CaptureLogsArgsParametrized {
  return !Array.isArray(args[1]);
}
