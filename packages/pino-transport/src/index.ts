import type { LogSeverityLevel } from '@sentry/core';
import { _INTERNAL_captureLog, isPrimitive, debug, normalize } from '@sentry/core';
import type buildType from 'pino-abstract-transport';
import * as pinoAbstractTransport from 'pino-abstract-transport';
import { DEBUG_BUILD } from './debug-build';

// Handle both CommonJS and ES module exports
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const build = (pinoAbstractTransport as any).default || pinoAbstractTransport;

/**
 * The default log levels that will be captured by the Sentry Pino transport.
 */
const DEFAULT_CAPTURED_LEVELS: Array<LogSeverityLevel> = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * Options for the Sentry Pino transport.
 */
export interface SentryPinoTransportOptions {
  /**
   * Use this option to filter which levels should be captured as logs.
   * By default, all levels are captured as logs.
   *
   * @example
   * ```ts
   * const logger = pino({
   *   transport: {
   *     target: '@sentry/pino-transport',
   *     options: {
   *       logLevels: ['error', 'warn'], // Only capture error and warn logs
   *     },
   *   },
   * });
   * ```
   */
  logLevels?: Array<LogSeverityLevel>;
}

/**
 * Pino source configuration passed to the transport.
 * This interface represents the configuration options that Pino provides to transports.
 */
interface PinoSourceConfig {
  /**
   * Custom levels configuration from Pino.
   * Contains the mapping of custom level names to numeric values.
   *
   * @default undefined
   * @example { values: { critical: 55, notice: 35 } }
   */
  levels?: unknown;

  /**
   * The property name used for the log message.
   * Pino allows customizing which property contains the main log message.
   *
   * @default 'msg'
   * @example 'message' when configured with messageKey: 'message'
   * @see https://getpino.io/#/docs/api?id=messagekey-string
   */
  messageKey?: string;

  /**
   * The property name used for error objects.
   * Pino allows customizing which property contains error information.
   *
   * @default 'err'
   * @example 'error' when configured with errorKey: 'error'
   * @see https://getpino.io/#/docs/api?id=errorkey-string
   */
  errorKey?: string;

  /**
   * The property name used to nest logged objects to avoid conflicts.
   * When set, Pino nests all logged objects under this key to prevent
   * conflicts with Pino's internal properties (level, time, pid, etc.).
   * The transport flattens these nested properties using dot notation.
   *
   * @default undefined (no nesting)
   * @example 'payload' - objects logged will be nested under { payload: {...} }
   * @see https://getpino.io/#/docs/api?id=nestedkey-string
   */
  nestedKey?: string;
}

/**
 * Creates a new Sentry Pino transport that forwards logs to Sentry. Requires `_experiments.enableLogs` to be enabled.
 *
 * Supports Pino v8 and v9.
 *
 * @param options - Options for the transport.
 * @returns A Pino transport that forwards logs to Sentry.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function createSentryPinoTransport(options?: SentryPinoTransportOptions): ReturnType<typeof buildType> {
  DEBUG_BUILD && debug.log('Initializing Sentry Pino transport');
  const capturedLogLevels = new Set(options?.logLevels ?? DEFAULT_CAPTURED_LEVELS);

  return build(
    async function (source: AsyncIterable<unknown> & PinoSourceConfig) {
      for await (const log of source) {
        try {
          if (!isObject(log)) {
            continue;
          }

          // Use Pino's messageKey if available, fallback to 'msg'
          const messageKey = source.messageKey || 'msg';
          const message = log[messageKey];
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [messageKey]: _, level, time, ...attributes } = log;

          // Handle nestedKey flattening if configured
          if (source.nestedKey && attributes[source.nestedKey] && isObject(attributes[source.nestedKey])) {
            const nestedObject = attributes[source.nestedKey] as Record<string, unknown>;
            // Remove the nested object and flatten its properties
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete attributes[source.nestedKey];

            // Flatten nested properties with dot notation
            for (const [key, value] of Object.entries(nestedObject)) {
              attributes[`${source.nestedKey}.${key}`] = value;
            }
          }

          const logSeverityLevel = mapPinoLevelToSentryLevel(log.level, source.levels);

          if (capturedLogLevels.has(logSeverityLevel)) {
            const logAttributes: Record<string, unknown> = {
              ...attributes,
              'sentry.origin': 'auto.logging.pino',
            };

            // Attach custom level as an attribute if it's a string (custom level)
            if (typeof log.level === 'string') {
              logAttributes['sentry.pino.level'] = log.level;
            }

            _INTERNAL_captureLog({
              level: logSeverityLevel,
              message: formatMessage(message),
              attributes: logAttributes,
            });
          }
        } catch {
          // Silently ignore errors to prevent breaking the logging pipeline
        }
      }
    },
    {
      expectPinoConfig: true,
    },
  );
}

function formatMessage(message: unknown): string {
  if (message === undefined) {
    return '';
  }

  if (isPrimitive(message)) {
    return String(message);
  }
  return JSON.stringify(normalize(message));
}

/**
 * Maps a Pino log level (numeric or custom string) to a Sentry log severity level.
 *
 * Handles both standard and custom levels, including when `useOnlyCustomLevels` is enabled.
 * Uses range-based mapping for numeric levels to handle custom values (e.g., 11 -> trace).
 */
function mapPinoLevelToSentryLevel(level: unknown, levelsConfig?: unknown): LogSeverityLevel {
  // Handle numeric levels
  if (typeof level === 'number') {
    return mapNumericLevelToSentryLevel(level);
  }

  // Handle custom string levels
  if (
    typeof level === 'string' &&
    isObject(levelsConfig) &&
    'values' in levelsConfig &&
    isObject(levelsConfig.values)
  ) {
    // Map custom string levels to numeric then to Sentry levels
    const numericLevel = levelsConfig.values[level];
    if (typeof numericLevel === 'number') {
      return mapNumericLevelToSentryLevel(numericLevel);
    }
  }

  // Default fallback
  return 'info';
}

/**
 * Maps a numeric level to the closest Sentry severity level using range-based mapping.
 * Handles both standard Pino levels and custom numeric levels.
 *
 * - `0-19` -> `trace`
 * - `20-29` -> `debug`
 * - `30-39` -> `info`
 * - `40-49` -> `warn`
 * - `50-59` -> `error`
 * - `60+` -> `fatal`
 *
 * @see https://github.com/pinojs/pino/blob/116b1b17935630b97222fbfd1c053d199d18ca4b/lib/constants.js#L6-L13
 */
function mapNumericLevelToSentryLevel(numericLevel: number): LogSeverityLevel {
  // 0-19 -> trace
  if (numericLevel < 20) {
    return 'trace';
  }
  // 20-29 -> debug
  if (numericLevel < 30) {
    return 'debug';
  }
  // 30-39 -> info
  if (numericLevel < 40) {
    return 'info';
  }
  // 40-49 -> warn
  if (numericLevel < 50) {
    return 'warn';
  }
  // 50-59 -> error
  if (numericLevel < 60) {
    return 'error';
  }
  // 60+ -> fatal
  return 'fatal';
}

/**
 * Type guard to check if a value is an object.
 */
function isObject(value: unknown): value is Record<string | number, unknown> {
  return typeof value === 'object' && value != null;
}

export default createSentryPinoTransport;
