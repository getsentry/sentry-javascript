import type { LogSeverityLevel, Log, Client, ParameterizedString } from '@sentry/core';
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
  message: ParameterizedString,
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
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., { userId: 100, route: '/dashboard' }.
 *
 * @example
 *
 * ```
 * Sentry.logger.trace('User clicked submit button', {
 *   buttonId: 'submit-form',
 *   formId: 'user-profile',
 *   timestamp: Date.now()
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.trace(Sentry.logger.fmt`User ${user} navigated to ${page}`, {
 *   userId: '123',
 *   sessionId: 'abc-xyz'
 * });
 * ```
 */
export function trace(message: ParameterizedString, attributes?: Log['attributes']): void {
  captureLog('trace', message, attributes);
}

/**
 * @summary Capture a log with the `debug` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., { component: 'Header', state: 'loading' }.
 *
 * @example
 *
 * ```
 * Sentry.logger.debug('Component mounted', {
 *   component: 'UserProfile',
 *   props: { userId: 123 },
 *   renderTime: 150
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.debug(Sentry.logger.fmt`API request to ${endpoint} failed`, {
 *   statusCode: 404,
 *   requestId: 'req-123',
 *   duration: 250
 * });
 * ```
 */
export function debug(message: ParameterizedString, attributes?: Log['attributes']): void {
  captureLog('debug', message, attributes);
}

/**
 * @summary Capture a log with the `info` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., { feature: 'checkout', status: 'completed' }.
 *
 * @example
 *
 * ```
 * Sentry.logger.info('User completed checkout', {
 *   orderId: 'order-123',
 *   amount: 99.99,
 *   paymentMethod: 'credit_card'
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.info(Sentry.logger.fmt`User ${user} updated profile picture`, {
 *   userId: 'user-123',
 *   imageSize: '2.5MB',
 *   timestamp: Date.now()
 * });
 * ```
 */
export function info(message: ParameterizedString, attributes?: Log['attributes']): void {
  captureLog('info', message, attributes);
}

/**
 * @summary Capture a log with the `warn` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., { browser: 'Chrome', version: '91.0' }.
 *
 * @example
 *
 * ```
 * Sentry.logger.warn('Browser compatibility issue detected', {
 *   browser: 'Safari',
 *   version: '14.0',
 *   feature: 'WebRTC',
 *   fallback: 'enabled'
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.warn(Sentry.logger.fmt`API endpoint ${endpoint} is deprecated`, {
 *   recommendedEndpoint: '/api/v2/users',
 *   sunsetDate: '2024-12-31',
 *   clientVersion: '1.2.3'
 * });
 * ```
 */
export function warn(message: ParameterizedString, attributes?: Log['attributes']): void {
  captureLog('warn', message, attributes);
}

/**
 * @summary Capture a log with the `error` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., { error: 'NetworkError', url: '/api/data' }.
 *
 * @example
 *
 * ```
 * Sentry.logger.error('Failed to load user data', {
 *   error: 'NetworkError',
 *   url: '/api/users/123',
 *   statusCode: 500,
 *   retryCount: 3
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.error(Sentry.logger.fmt`Payment processing failed for order ${orderId}`, {
 *   error: 'InsufficientFunds',
 *   amount: 100.00,
 *   currency: 'USD',
 *   userId: 'user-456'
 * });
 * ```
 */
export function error(message: ParameterizedString, attributes?: Log['attributes']): void {
  captureLog('error', message, attributes);
}

/**
 * @summary Capture a log with the `fatal` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., { appState: 'corrupted', sessionId: 'abc-123' }.
 *
 * @example
 *
 * ```
 * Sentry.logger.fatal('Application state corrupted', {
 *   lastKnownState: 'authenticated',
 *   sessionId: 'session-123',
 *   timestamp: Date.now(),
 *   recoveryAttempted: true
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.fatal(Sentry.logger.fmt`Critical system failure in ${service}`, {
 *   service: 'payment-processor',
 *   errorCode: 'CRITICAL_FAILURE',
 *   affectedUsers: 150,
 *   timestamp: Date.now()
 * });
 * ```
 */
export function fatal(message: ParameterizedString, attributes?: Log['attributes']): void {
  captureLog('fatal', message, attributes);
}

export { fmt } from '@sentry/core';
