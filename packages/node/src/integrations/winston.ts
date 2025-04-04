/* eslint-disable @typescript-eslint/ban-ts-comment */
import { getClient } from '@sentry/core';
import type { LogSeverityLevel } from '@sentry/core';
import { captureLog } from '../logs/capture';

const DEFAULT_CAPTURED_LEVELS: Array<LogSeverityLevel> = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * Options for the Sentry Winston transport.
 */
interface WinstonTransportOptions {
  /**
   * Use this option to filter which levels should be captured. By default, all levels are captured.
   *
   * @example
   * ```ts
   * const transport = Sentry.createSentryWinstonTransport(Transport, {
   *   // Only capture error and warn logs
   *   levels: ['error', 'warn'],
   * });
   * ```
   */
  levels?: Array<LogSeverityLevel>;
}

/**
 * Creates a new Sentry Winston transport that fowards logs to Sentry.
 *
 * @param TransportClass - The Winston transport class to extend.
 * @returns The extended transport class.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 *
 * @example
 * ```ts
 * const winston = require('winston');
 * const Transport = require('winston-transport');
 *
 * const transport = Sentry.createSentryWinstonTransport(Transport);
 *
 * const logger = winston.createLogger({
 *   transports: [transport],
 * });
 * ```
 */
export function createSentryWinstonTransport<TransportStreamInstance extends object>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TransportClass: new (options?: any) => TransportStreamInstance,
  sentryWinstonOptions?: WinstonTransportOptions,
): typeof TransportClass {
  // @ts-ignore - We know this is safe because SentryWinstonTransport extends TransportClass
  class SentryWinstonTransport extends TransportClass {
    private _levels: Set<LogSeverityLevel>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(options?: any) {
      super(options);
      this._levels = new Set(sentryWinstonOptions?.levels ?? DEFAULT_CAPTURED_LEVELS);
    }

    /**
     * Foward a winston log to the Sentry SDK.
     */
    public log(info: unknown, callback: () => void): void {
      try {
        setImmediate(() => {
          // @ts-ignore - We know this is safe because SentryWinstonTransport extends TransportClass
          this.emit('logged', info);
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { level, message, timestamp, ...attributes } = info as Record<string, unknown>;
        const logSeverityLevel = WINSTON_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP[level as string] ?? 'info';
        if (this._levels.has(logSeverityLevel)) {
          captureLog(logSeverityLevel, message as string, attributes);
        } else {
          getClient()?.recordDroppedEvent('event_processor', 'log_item', 1);
        }
      } catch {
        // do nothing
      }

      if (callback) {
        callback();
      }
    }
  }

  return SentryWinstonTransport as typeof TransportClass;
}

// npm
// {
//   error: 0,
//   warn: 1,
//   info: 2,
//   http: 3,
//   verbose: 4,
//   debug: 5,
//   silly: 6
// }
//
// syslog
// {
//   emerg: 0,
//   alert: 1,
//   crit: 2,
//   error: 3,
//   warning: 4,
//   notice: 5,
//   info: 6,
//   debug: 7,
// }
const WINSTON_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP: Record<string, LogSeverityLevel> = {
  // npm
  silly: 'trace',
  // npm and syslog
  debug: 'debug',
  // npm
  verbose: 'debug',
  // npm
  http: 'debug',
  // npm and syslog
  info: 'info',
  // syslog
  notice: 'info',
  // npm
  warn: 'warn',
  // syslog
  warning: 'warn',
  // npm and syslog
  error: 'error',
  // syslog
  emerg: 'fatal',
  // syslog
  alert: 'fatal',
  // syslog
  crit: 'fatal',
};
