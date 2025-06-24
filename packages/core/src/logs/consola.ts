import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { LogSeverityLevel } from '../types-hoist/log';
import { formatConsoleArgs } from '../utils/console';
import { logger } from '../utils/logger';
import { _INTERNAL_captureLog } from './exports';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface SentryConsolaReporterOptions {
  // empty
}

/**
 * Map consola log types to Sentry log levels
 */
const CONSOLA_TYPE_TO_SENTRY_LEVEL: Record<LogType, LogSeverityLevel> = {
  // 0
  silent: 'fatal',
  fatal: 'fatal',
  error: 'error',
  // 1
  warn: 'warn',
  // 2
  log: 'info',
  // 3
  info: 'info',
  success: 'info',
  fail: 'info',
  ready: 'info',
  start: 'info',
  box: 'info',
  // Verbose
  debug: 'debug',
  trace: 'trace',
  verbose: 'trace',
};

/**
 * Map consola log levels (numeric) to Sentry levels
 */
function getLogLevelFromNumeric(level: LogLevel): LogSeverityLevel {
  if (level === 0) {
    return 'error';
  }
  if (level === 1) {
    return 'warn';
  }
  if (level === 2) {
    return 'info';
  }
  if (level === 3) {
    return 'info';
  }
  if (level === 4) {
    return 'debug';
  }
  return 'trace';
}

/**
 * Sentry reporter for Consola. Requires `_experiments.enableLogs` to be enabled.
 *
 * @experimental This feature is experimental and may be changed or removed in future versions.
 */
export function createConsolaReporter(options?: SentryConsolaReporterOptions, client = getClient()): ConsolaReporter {
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client found, Consola reporter disabled');
    return {
      log: () => {
        // no-op
      },
    };
  }

  const { _experiments, normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = client.getOptions();

  if (!_experiments?.enableLogs) {
    DEBUG_BUILD && logger.warn('Consola reporter disabled, _experiments.enableLogs is not enabled');
    return {
      log: () => {
        // no-op
      },
    };
  }

  return {
    log: (logObj: LogObject) => {
      // Determine Sentry log level
      const sentryLevel = CONSOLA_TYPE_TO_SENTRY_LEVEL[logObj.type] ?? getLogLevelFromNumeric(logObj.level);

      // Format the message from consola log object
      let message = '';
      const args = [...logObj.args];

      // Handle message property
      if (logObj.message) {
        message = String(logObj.message);
      }

      // Handle additional property
      if (logObj.additional) {
        const additionalText = Array.isArray(logObj.additional)
          ? logObj.additional.join('\n')
          : String(logObj.additional);
        if (message) {
          message += `\n${additionalText}`;
        } else {
          message = additionalText;
        }
      }

      // If no message from properties, format args
      if (!message && args.length > 0) {
        message = formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth);
      }

      // Build attributes
      const attributes: Record<string, string> = {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.consola.logging',
      };
      if (logObj.tag) {
        attributes['consola.tag'] = logObj.tag;
      }

      _INTERNAL_captureLog({
        level: sentryLevel,
        message,
        attributes,
      });
    },
  };
}

/**
 * Defines the level of logs as specific numbers or special number types.
 *
 * @type {0 | 1 | 2 | 3 | 4 | 5 | (number & {})} LogLevel - Represents the log level.
 * @default 0 - Represents the default log level.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
type LogLevel = 0 | 1 | 2 | 3 | 4 | 5 | (number & {});

/**
 * Lists the types of log messages supported by the system.
 *
 * @type {"silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose"} LogType - Represents the specific type of log message.
 */
type LogType =
  // 0
  | 'silent'
  | 'fatal'
  | 'error'
  // 1
  | 'warn'
  // 2
  | 'log'
  // 3
  | 'info'
  | 'success'
  | 'fail'
  | 'ready'
  | 'start'
  | 'box'
  // Verbose
  | 'debug'
  | 'trace'
  | 'verbose';

interface InputLogObject {
  /**
   * The logging level of the message. See {@link LogLevel}.
   * @optional
   */
  level?: LogLevel;

  /**
   * A string tag to categorise or identify the log message.
   * @optional
   */
  tag?: string;

  /**
   * The type of log message, which affects how it's processed and displayed. See {@link LogType}.
   * @optional
   */
  type?: LogType;

  /**
   * The main log message text.
   * @optional
   */
  message?: string;

  /**
   * Additional text or texts to be logged with the message.
   * @optional
   */
  additional?: string | string[];

  /**
   * Additional arguments to be logged with the message.
   * @optional
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: any[];

  /**
   * The date and time when the log message was created.
   * @optional
   */
  date?: Date;
}

interface LogObject extends InputLogObject {
  /**
   * The logging level of the message, overridden if required. See {@link LogLevel}.
   */
  level: LogLevel;

  /**
   * The type of log message, overridden if required. See {@link LogType}.
   */
  type: LogType;

  /**
   * A string tag to categorise or identify the log message, overridden if necessary.
   */
  tag: string;

  /**
   * Additional arguments to be logged with the message, overridden if necessary.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];

  /**
   * The date and time the log message was created, overridden if necessary.
   */
  date: Date;

  /**
   * Allows additional custom properties to be set on the log object.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  [key: string]: unknown;
}

interface ConsolaReporter {
  /**
   * Defines how a log message is processed and displayed by this reporter.
   * @param logObj The LogObject containing the log information to process. See {@link LogObject}.
   */
  log: (logObj: LogObject) => void;
}
