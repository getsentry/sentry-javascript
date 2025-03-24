import { format } from 'node:util';

import type { LogSeverityLevel, Log, ParameterizedString } from '@sentry/core';
import { _INTERNAL_captureLog } from '@sentry/core';

type CaptureLogArgs =
  | [message: ParameterizedString, attributes?: Log['attributes']]
  | [messageTemplate: string, messageParams: Array<unknown>, attributes?: Log['attributes']];

/**
 * Capture a log with the given level.
 *
 * @param level - The level of the log.
 * @param message - The message to log.
 * @param attributes - Arbitrary structured data that stores information about the log - e.g., userId: 100.
 */
function captureLog(level: LogSeverityLevel, ...args: CaptureLogArgs): void {
  const [messageOrMessageTemplate, paramsOrAttributes, maybeAttributes] = args;
  if (Array.isArray(paramsOrAttributes)) {
    const attributes = { ...maybeAttributes };
    attributes['sentry.message.template'] = messageOrMessageTemplate;
    paramsOrAttributes.forEach((param, index) => {
      attributes[`sentry.message.param.${index}`] = param;
    });
    const message = format(messageOrMessageTemplate, ...paramsOrAttributes);
    _INTERNAL_captureLog({ level, message, attributes });
  } else {
    _INTERNAL_captureLog({ level, message: messageOrMessageTemplate, attributes: paramsOrAttributes });
  }
}

/**
 * @summary Capture a log with the `trace` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.trace('Starting database connection', {
 *   database: 'users',
 *   connectionId: 'conn_123'
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.trace('Database connection %s established for %s',
 *   ['successful', 'users'],
 *   { connectionId: 'conn_123' }
 * );
 * ```
 */
export function trace(...args: CaptureLogArgs): void {
  captureLog('trace', ...args);
}

/**
 * @summary Capture a log with the `debug` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.debug('Cache miss for user profile', {
 *   userId: 'user_123',
 *   cacheKey: 'profile:user_123'
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.debug('Cache %s for %s: %s',
 *   ['miss', 'user profile', 'key not found'],
 *   { userId: 'user_123' }
 * );
 * ```
 */
export function debug(...args: CaptureLogArgs): void {
  captureLog('debug', ...args);
}

/**
 * @summary Capture a log with the `info` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.info('User profile updated', {
 *   userId: 'user_123',
 *   updatedFields: ['email', 'preferences']
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.info('User %s updated their %s',
 *   ['John Doe', 'profile settings'],
 *   { userId: 'user_123' }
 * );
 * ```
 */
export function info(...args: CaptureLogArgs): void {
  captureLog('info', ...args);
}

/**
 * @summary Capture a log with the `warn` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.warn('Rate limit approaching', {
 *   endpoint: '/api/users',
 *   currentRate: '95/100',
 *   resetTime: '2024-03-20T10:00:00Z'
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.warn('Rate limit %s for %s: %s',
 *   ['approaching', '/api/users', '95/100 requests'],
 *   { resetTime: '2024-03-20T10:00:00Z' }
 * );
 * ```
 */
export function warn(...args: CaptureLogArgs): void {
  captureLog('warn', ...args);
}

/**
 * @summary Capture a log with the `error` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.error('Failed to process payment', {
 *   orderId: 'order_123',
 *   errorCode: 'PAYMENT_FAILED',
 *   amount: 99.99
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.error('Payment processing failed for order %s: %s',
 *   ['order_123', 'insufficient funds'],
 *   { amount: 99.99 }
 * );
 * ```
 */
export function error(...args: CaptureLogArgs): void {
  captureLog('error', ...args);
}

/**
 * @summary Capture a log with the `fatal` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.fatal('Database connection pool exhausted', {
 *   database: 'users',
 *   activeConnections: 100,
 *   maxConnections: 100
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.fatal('Database %s: %s connections active',
 *   ['connection pool exhausted', '100/100'],
 *   { database: 'users' }
 * );
 * ```
 */
export function fatal(...args: CaptureLogArgs): void {
  captureLog('fatal', ...args);
}

/**
 * @summary Capture a log with the `critical` level. Requires `_experiments.enableLogs` to be enabled.
 *
 * You can either pass a message and attributes or a message template, params and attributes.
 *
 * @example
 *
 * ```
 * Sentry.logger.critical('Service health check failed', {
 *   service: 'payment-gateway',
 *   status: 'DOWN',
 *   lastHealthy: '2024-03-20T09:55:00Z'
 * });
 * ```
 *
 * @example With template strings
 *
 * ```
 * Sentry.logger.critical('Service %s is %s',
 *   ['payment-gateway', 'DOWN'],
 *   { lastHealthy: '2024-03-20T09:55:00Z' }
 * );
 * ```
 */
export function critical(...args: CaptureLogArgs): void {
  captureLog('critical', ...args);
}

export { fmt } from '@sentry/core';
