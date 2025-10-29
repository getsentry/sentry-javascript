import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { _INTERNAL_captureLog } from '../logs/internal';
import { formatConsoleArgs } from '../logs/utils';
import type { LogSeverityLevel } from '../types-hoist/log';

/**
 * Options for the Sentry Consola reporter.
 */
interface ConsolaReporterOptions {
  /**
   * Use this option to filter which levels should be captured. By default, all levels are captured.
   *
   * @example
   * ```ts
   * const sentryReporter = Sentry.createConsolaReporter({
   *   // Only capture error and warn logs
   *   levels: ['error', 'warn'],
   * });
   * consola.addReporter(sentryReporter);
   * ```
   */
  levels?: Array<LogSeverityLevel>;

  /**
   * Optionally provide a specific Sentry client instance to use for capturing logs.
   * If not provided, the current client will be retrieved using `getClient()`.
   *
   * This is useful when you want to use specific client options for log normalization
   * or when working with multiple client instances.
   *
   * @example
   * ```ts
   * const sentryReporter = Sentry.createConsolaReporter({
   *   client: myCustomClient,
   * });
   * ```
   */
  client?: Client;
}

export interface ConsolaReporter {
  log: (logObj: ConsolaLogObject) => void;
}

/**
 * Represents a log object that Consola reporters receive.
 *
 * This interface matches the structure of log objects passed to Consola reporters.
 * See: https://github.com/unjs/consola#custom-reporters
 *
 * @example
 * ```ts
 * const reporter = {
 *   log(logObj: ConsolaLogObject) {
 *     console.log(`[${logObj.type}] ${logObj.message || logObj.args?.join(' ')}`);
 *   }
 * };
 * consola.addReporter(reporter);
 * ```
 */
export interface ConsolaLogObject {
  /**
   * Allows additional custom properties to be set on the log object.
   * These properties will be captured as log attributes with a 'consola.' prefix.
   *
   * @example
   * ```ts
   * const reporter = Sentry.createConsolaReporter();
   * reporter.log({
   *   type: 'info',
   *   message: 'User action',
   *   userId: 123,
   *   sessionId: 'abc-123'
   * });
   * // Will create attributes: consola.userId and consola.sessionId
   * ```
   */
  [key: string]: unknown;

  /**
   * The numeric log level (0-5) or null.
   *
   * Consola log levels:
   * - 0: Fatal and Error
   * - 1: Warnings
   * - 2: Normal logs
   * - 3: Informational logs, success, fail, ready, start, box, ...
   * - 4: Debug logs
   * - 5: Trace logs
   * - null: Some special types like 'verbose'
   *
   * See: https://github.com/unjs/consola/blob/main/README.md#log-level
   */
  level?: number | null;

  /**
   * The log type/method name (e.g., 'error', 'warn', 'info', 'debug', 'trace', 'success', 'fail', etc.).
   *
   * Consola built-in types include:
   * - Standard: silent, fatal, error, warn, log, info, success, fail, ready, start, box, debug, trace, verbose
   * - Custom types can also be defined
   *
   * See: https://github.com/unjs/consola/blob/main/README.md#log-types
   */
  type?: string;

  /**
   * An optional tag/scope for the log entry.
   *
   * Tags are created using `consola.withTag('scope')` and help categorize logs.
   *
   * @example
   * ```ts
   * const scopedLogger = consola.withTag('auth');
   * scopedLogger.info('User logged in'); // tag will be 'auth'
   * ```
   *
   * See: https://github.com/unjs/consola/blob/main/README.md#withtagtag
   */
  tag?: string;

  /**
   * The raw arguments passed to the log method.
   *
   * When `message` is not provided, these args are typically formatted into the final message.
   *
   * @example
   * ```ts
   * consola.info('Hello', 'world', { user: 'john' });
   * // args = ['Hello', 'world', { user: 'john' }]
   * ```
   */
  args?: unknown[];

  /**
   * The timestamp when the log was created.
   *
   * This is automatically set by Consola when the log is created.
   */
  date?: Date;

  /**
   * The formatted log message.
   *
   * When provided, this is the final formatted message. When not provided,
   * the message should be constructed from the `args` array.
   */
  message?: string;
}

const DEFAULT_CAPTURED_LEVELS: Array<LogSeverityLevel> = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * Creates a new Sentry reporter for Consola that forwards logs to Sentry. Requires the `enableLogs` option to be enabled.
 *
 * **Note: This integration supports Consola v3.x only.** The reporter interface and log object structure
 * may differ in other versions of Consola.
 *
 * @param options - Configuration options for the reporter.
 * @returns A Consola reporter that can be added to consola instances.
 *
 * @example
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import { consola } from 'consola';
 *
 * Sentry.init({
 *   enableLogs: true,
 * });
 *
 * const sentryReporter = Sentry.createConsolaReporter({
 *   // Optional: filter levels to capture
 *   levels: ['error', 'warn', 'info'],
 * });
 *
 * consola.addReporter(sentryReporter);
 *
 * // Now consola logs will be captured by Sentry
 * consola.info('This will be sent to Sentry');
 * consola.error('This error will also be sent to Sentry');
 * ```
 */
export function createConsolaReporter(options: ConsolaReporterOptions = {}): ConsolaReporter {
  const levels = new Set(options.levels ?? DEFAULT_CAPTURED_LEVELS);
  const providedClient = options.client;

  return {
    log(logObj: ConsolaLogObject) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type, level, message: consolaMessage, args, tag, date: _date, ...attributes } = logObj;

      // Get client - use provided client or current client
      const client = providedClient || getClient();
      if (!client) {
        return;
      }

      // Determine the log severity level
      const logSeverityLevel = getLogSeverityLevel(type, level);

      // Early exit if this level should not be captured
      if (!levels.has(logSeverityLevel)) {
        return;
      }

      const { normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = client.getOptions();

      // Format the log message using the same approach as consola's basic reporter
      const messageParts = [];
      if (consolaMessage) {
        messageParts.push(consolaMessage);
      }
      if (args && args.length > 0) {
        messageParts.push(formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth));
      }
      const message = messageParts.join(' ');

      // Build attributes
      attributes['sentry.origin'] = 'auto.log.consola';

      if (tag) {
        attributes['consola.tag'] = tag;
      }

      if (type) {
        attributes['consola.type'] = type;
      }

      // Only add level if it's a valid number (not null/undefined)
      if (level != null && typeof level === 'number') {
        attributes['consola.level'] = level;
      }

      _INTERNAL_captureLog({
        level: logSeverityLevel,
        message,
        attributes,
      });
    },
  };
}

// Mapping from consola log types to Sentry log severity levels
const CONSOLA_TYPE_TO_LOG_SEVERITY_LEVEL_MAP: Record<string, LogSeverityLevel> = {
  // Consola built-in types
  silent: 'trace',
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  log: 'info',
  info: 'info',
  success: 'info',
  fail: 'error',
  ready: 'info',
  start: 'info',
  box: 'info',
  debug: 'debug',
  trace: 'trace',
  verbose: 'debug',
  // Custom types that might exist
  critical: 'fatal',
  notice: 'info',
};

// Mapping from consola log levels (numbers) to Sentry log severity levels
const CONSOLA_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP: Record<number, LogSeverityLevel> = {
  0: 'fatal', // Fatal and Error
  1: 'warn', // Warnings
  2: 'info', // Normal logs
  3: 'info', // Informational logs, success, fail, ready, start, ...
  4: 'debug', // Debug logs
  5: 'trace', // Trace logs
};

/**
 * Determines the log severity level from Consola type and level.
 *
 * @param type - The Consola log type (e.g., 'error', 'warn', 'info')
 * @param level - The Consola numeric log level (0-5) or null for some types like 'verbose'
 * @returns The corresponding Sentry log severity level
 */
function getLogSeverityLevel(type?: string, level?: number | null): LogSeverityLevel {
  // Handle special case for verbose logs (level can be null with infinite level in Consola)
  if (type === 'verbose') {
    return 'debug';
  }

  // Handle silent logs - these should be at trace level
  if (type === 'silent') {
    return 'trace';
  }

  // First try to map by type (more specific)
  if (type) {
    const mappedLevel = CONSOLA_TYPE_TO_LOG_SEVERITY_LEVEL_MAP[type];
    if (mappedLevel) {
      return mappedLevel;
    }
  }

  // Fallback to level mapping (handle null level)
  if (typeof level === 'number') {
    const mappedLevel = CONSOLA_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP[level];
    if (mappedLevel) {
      return mappedLevel;
    }
  }

  // Default fallback
  return 'info';
}
