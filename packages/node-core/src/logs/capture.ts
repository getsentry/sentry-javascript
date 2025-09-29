import { format } from 'node:util';
import type { Log, LogSeverityLevel, ParameterizedString, Scope } from '@sentry/core';
import { _INTERNAL_captureLog } from '@sentry/core';

/**
 * Additional metadata to capture the log with.
 */
export interface CaptureLogMetadata {
  scope?: Scope;
}

type CaptureLogArgWithTemplate = [
  messageTemplate: string,
  messageParams: Array<unknown>,
  attributes?: Log['attributes'],
  metadata?: CaptureLogMetadata,
];

type CaptureLogArgWithoutTemplate = [
  message: ParameterizedString,
  attributes?: Log['attributes'],
  metadata?: CaptureLogMetadata,
];

export type CaptureLogArgs = CaptureLogArgWithTemplate | CaptureLogArgWithoutTemplate;

/**
 * Capture a log with the given level.
 */
export function captureLog(
  level: LogSeverityLevel,
  message: ParameterizedString,
  attributes?: Log['attributes'],
  metadata?: CaptureLogMetadata,
): void;
/**
 * Capture a log with the given level.
 */
export function captureLog(
  level: LogSeverityLevel,
  messageTemplate: string,
  messageParams: Array<unknown>,
  attributes?: Log['attributes'],
  metadata?: CaptureLogMetadata,
): void;
/**
 * Capture a log with the given level.
 */
export function captureLog(level: LogSeverityLevel, ...args: CaptureLogArgs): void {
  const [messageOrMessageTemplate, paramsOrAttributes, maybeAttributesOrMetadata, maybeMetadata] = args;
  if (Array.isArray(paramsOrAttributes)) {
    const attributes = { ...(maybeAttributesOrMetadata as Log['attributes']) };
    attributes['sentry.message.template'] = messageOrMessageTemplate;
    paramsOrAttributes.forEach((param, index) => {
      attributes[`sentry.message.parameter.${index}`] = param;
    });
    const message = format(messageOrMessageTemplate, ...paramsOrAttributes);
    _INTERNAL_captureLog({ level, message, attributes }, maybeMetadata?.scope);
  } else {
    _INTERNAL_captureLog(
      { level, message: messageOrMessageTemplate, attributes: paramsOrAttributes },
      maybeMetadata?.scope,
    );
  }
}
