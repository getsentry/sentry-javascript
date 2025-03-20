import { format } from 'node:util';

import type { LogSeverityLevel, Log } from '@sentry/core';
import { _INTERNAL_captureLog } from '@sentry/core';

/**
 * Capture a log with the given level.
 *
 * @param level - The level of the log.
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 */
function captureLog(level: LogSeverityLevel, message: string, attributes?: Log['attributes']): void {
  _INTERNAL_captureLog({ level, message, attributes });
}

/**
 * @summary Capture a log with the `trace` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.trace('Hello world', { userId: 100 });
 * ```
 */
export function trace(message: string, attributes?: Log['attributes']): void {
  captureLog('trace', message, attributes);
}

/**
 * @summary Capture a log with the `debug` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.debug('Hello world', { userId: 100 });
 * ```
 */
export function debug(message: string, attributes?: Log['attributes']): void {
  captureLog('debug', message, attributes);
}

/**
 * @summary Capture a log with the `info` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.info('Hello world', { userId: 100 });
 * ```
 */
export function info(message: string, attributes?: Log['attributes']): void {
  captureLog('info', message, attributes);
}

/**
 * @summary Capture a log with the `warn` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.warn('Hello world', { userId: 100 });
 * ```
 */
export function warn(message: string, attributes?: Log['attributes']): void {
  captureLog('warn', message, attributes);
}

/**
 * @summary Capture a log with the `error` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.error('Hello world', { userId: 100 });
 * ```
 */
export function error(message: string, attributes?: Log['attributes']): void {
  captureLog('error', message, attributes);
}

/**
 * @summary Capture a log with the `fatal` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.fatal('Hello world', { userId: 100 });
 * ```
 */
export function fatal(message: string, attributes?: Log['attributes']): void {
  captureLog('fatal', message, attributes);
}

/**
 * @summary Capture a log with the `critical` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.critical('Hello world', { userId: 100 });
 * ```
 */
export function critical(message: string, attributes?: Log['attributes']): void {
  captureLog('critical', message, attributes);
}

/**
 * Capture a formatted log with the given level.
 *
 * @param level - The level of the log.
 * @param message - The message template.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 */
function captureLogFmt(
  level: LogSeverityLevel,
  messageTemplate: string,
  params: Array<unknown>,
  logAttributes: Log['attributes'] = {},
): void {
  const attributes = { ...logAttributes };
  attributes['sentry.message.template'] = messageTemplate;
  params.forEach((param, index) => {
    attributes[`sentry.message.param.${index}`] = param;
  });
  const message = format(messageTemplate, ...params);
  _INTERNAL_captureLog({ level, message, attributes });
}

/**
 * @summary Capture a formatted log with the `trace` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.traceFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function traceFmt(message: string, params: Array<unknown>, attributes: Log['attributes'] = {}): void {
  captureLogFmt('trace', message, params, attributes);
}

/**
 * @summary Capture a formatted log with the `debug` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.debugFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function debugFmt(message: string, params: Array<unknown>, attributes: Log['attributes'] = {}): void {
  captureLogFmt('debug', message, params, attributes);
}

/**
 * @summary Capture a formatted log with the `info` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.infoFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function infoFmt(message: string, params: Array<unknown>, attributes?: Log['attributes']): void {
  captureLogFmt('info', message, params, attributes);
}

/**
 * @summary Capture a formatted log with the `warn` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.warnFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function warnFmt(message: string, params: Array<unknown>, attributes?: Log['attributes']): void {
  captureLogFmt('warn', message, params, attributes);
}

/**
 * @summary Capture a formatted log with the `error` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.errorFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function errorFmt(message: string, params: Array<unknown>, attributes?: Log['attributes']): void {
  captureLogFmt('error', message, params, attributes);
}

/**
 * @summary Capture a formatted log with the `fatal` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.fatalFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function fatalFmt(message: string, params: Array<unknown>, attributes?: Log['attributes']): void {
  captureLogFmt('fatal', message, params, attributes);
}

/**
 * @summary Capture a formatted log with the `critical` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param params - The parameters to interpolate into the message.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 *
 * @example
 *
 * ```
 * Sentry.logger.criticalFmt('Hello world %s', ['foo'], { userId: 100 });
 * ```
 */
export function criticalFmt(message: string, params: Array<unknown>, attributes?: Log['attributes']): void {
  captureLogFmt('critical', message, params, attributes);
}
