/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { LogSeverityLevel } from '@sentry/core';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { captureLog } from '../logs/capture';

const DEFAULT_CAPTURED_LEVELS: Array<LogSeverityLevel> = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

// See: https://github.com/winstonjs/triple-beam
const LEVEL_SYMBOL = Symbol.for('level');
const MESSAGE_SYMBOL = Symbol.for('message');
const SPLAT_SYMBOL = Symbol.for('splat');

/**
 * Options for the Sentry Winston transport.
 */
interface WinstonTransportOptions {
  /**
   * Use this option to filter which levels should be captured. By default, all levels are captured.
   *
   * @example
   * ```ts
   * const SentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport, {
   *   // Only capture error and warn logs
   *   levels: ['error', 'warn'],
   * });
   * ```
   */
  levels?: Array<LogSeverityLevel>;

  /**
   * Use this option to map custom levels to Sentry log severity levels.
   *
   * @example
   * ```ts
   * const SentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport, {
   *   customLevelMap: {
   *     myCustomLevel: 'info',
   *     customError: 'error',
   *   },
   * });
   * ```
   */
  customLevelMap?: Record<string, LogSeverityLevel>;
}

/**
 * Creates a new Sentry Winston transport that fowards logs to Sentry. Requires the `enableLogs` option to be enabled.
 *
 * Supports Winston 3.x.x.
 *
 * @param TransportClass - The Winston transport class to extend.
 * @returns The extended transport class.
 *
 * @example
 * ```ts
 * const winston = require('winston');
 * const Transport = require('winston-transport');
 *
 * const SentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport);
 *
 * const logger = winston.createLogger({
 *   transports: [new SentryWinstonTransport()],
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
     * Forwards a winston log to the Sentry SDK.
     */
    public log(info: unknown, callback: () => void): void {
      try {
        setImmediate(() => {
          // @ts-ignore - We know this is safe because SentryWinstonTransport extends TransportClass
          this.emit('logged', info);
        });

        if (!isObject(info)) {
          return;
        }

        const levelFromSymbol = info[LEVEL_SYMBOL];

        // See: https://github.com/winstonjs/winston?tab=readme-ov-file#streams-objectmode-and-info-objects
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { level, message, timestamp, ...attributes } = info;
        // Remove all symbols from the remaining attributes
        attributes[LEVEL_SYMBOL] = undefined;
        attributes[MESSAGE_SYMBOL] = undefined;
        attributes[SPLAT_SYMBOL] = undefined;

        const customLevel = sentryWinstonOptions?.customLevelMap?.[levelFromSymbol as string];
        const winstonLogLevel = WINSTON_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP[levelFromSymbol as string];
        const logSeverityLevel = customLevel ?? winstonLogLevel ?? 'info';

        if (this._levels.has(logSeverityLevel)) {
          captureLog(logSeverityLevel, message as string, {
            ...attributes,
            'sentry.origin': 'auto.log.winston',
          });
        } else if (!customLevel && !winstonLogLevel) {
          DEBUG_BUILD &&
            debug.log(
              `Winston log level ${levelFromSymbol} is not captured by Sentry. Please add ${levelFromSymbol} to the "customLevelMap" option of the Sentry Winston transport.`,
            );
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

function isObject(anything: unknown): anything is Record<string | symbol, unknown> {
  return typeof anything === 'object' && anything != null;
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
