import { format } from 'node:util';
import type { Log, LogSeverityLevel, ParameterizedString, Scope } from '@sentry/core';
import { _INTERNAL_captureLog } from '@sentry/core';

/**
 * Additional metadata to capture the log with.
 */
interface CaptureLogMetadata {
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
 *
 * @param level - The level of the log.
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 */
export function captureLog(level: LogSeverityLevel, ...args: CaptureLogArgs): void {
  const [messageOrMessageTemplate, paramsOrAttributes, maybeAttributesOrMetadata, maybeMetadata] = args;
  if (Array.isArray(paramsOrAttributes)) {
    // type-casting here because from the type definitions we know that `maybeAttributesOrMetadata` is an attributes object (or undefined)
    const attributes = { ...(maybeAttributesOrMetadata as Log['attributes'] | undefined) };
    attributes['sentry.message.template'] = messageOrMessageTemplate;
    paramsOrAttributes.forEach((param, index) => {
      attributes[`sentry.message.parameter.${index}`] = param;
    });
    const message = format(messageOrMessageTemplate, ...paramsOrAttributes);
    _INTERNAL_captureLog({ level, message, attributes }, maybeMetadata?.scope);
  } else {
    _INTERNAL_captureLog(
      { level, message: messageOrMessageTemplate, attributes: paramsOrAttributes },
      // type-casting here because from the type definitions we know that `maybeAttributesOrMetadata` is a metadata object (or undefined)
      (maybeAttributesOrMetadata as CaptureLogMetadata | undefined)?.scope ?? maybeMetadata?.scope,
    );
  }
}
