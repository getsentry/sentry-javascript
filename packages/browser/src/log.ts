import type { LogSeverityLevel, Log, Client } from '@sentry/core';
import { getClient, _INTERNAL_captureLog, _INTERNAL_flushLogsBuffer } from '@sentry/core';

import { WINDOW } from './helpers';

/**
 * TODO: Make this configurable
 */
const DEFAULT_FLUSH_INTERVAL = 5000;

let timeout: ReturnType<typeof setTimeout> | undefined;

/**
 * This is a global timeout that is used to flush the logs buffer.
 * It is used to ensure that logs are flushed even if the client is not flushed.
 */
function startFlushTimeout(client: Client): void {
  if (timeout) {
    clearTimeout(timeout);
  }

  timeout = setTimeout(() => {
    _INTERNAL_flushLogsBuffer(client);
  }, DEFAULT_FLUSH_INTERVAL);
}

let isClientListenerAdded = false;
/**
 * This is a function that is used to add a flush listener to the client.
 * It is used to ensure that the logger buffer is flushed when the client is flushed.
 */
function addFlushingListeners(client: Client): void {
  if (isClientListenerAdded || !client.getOptions()._experiments?.enableLogs) {
    return;
  }

  isClientListenerAdded = true;

  if (WINDOW.document) {
    WINDOW.document.addEventListener('visibilitychange', () => {
      if (WINDOW.document.visibilityState === 'hidden') {
        _INTERNAL_flushLogsBuffer(client);
      }
    });
  }

  client.on('flush', () => {
    _INTERNAL_flushLogsBuffer(client);
  });
}

/**
 * Capture a log with the given level.
 *
 * @param level - The level of the log.
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 * @param severityNumber - The severity number of the log.
 */
function captureLog(
  level: LogSeverityLevel,
  message: string,
  attributes?: Log['attributes'],
  severityNumber?: Log['severityNumber'],
): void {
  const client = getClient();
  if (client) {
    addFlushingListeners(client);

    startFlushTimeout(client);
  }

  _INTERNAL_captureLog({ level, message, attributes, severityNumber }, client, undefined);
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
