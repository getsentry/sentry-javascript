import type { ParameterizedString } from './parameterize';

export type LogSeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface Log {
  /**
   * The severity level of the log.
   *
   * Allowed values are, from highest to lowest:
   * `critical`, `fatal`, `error`, `warn`, `info`, `debug`, `trace`.
   *
   * The log level changes how logs are filtered and displayed.
   * Critical level logs are emphasized more than trace level logs.
   */
  level: LogSeverityLevel;

  /**
   * The message to be logged.
   */
  message: ParameterizedString;

  /**
   * Arbitrary structured data that stores information about the log - e.g., userId: 100.
   */
  attributes?: Record<string, unknown>;

  /**
   * The severity number.
   */
  severityNumber?: number;
}

export type SerializedLogAttributeValue =
  | { value: string; type: 'string' }
  | { value: number; type: 'integer' }
  | { value: number; type: 'double' }
  | { value: boolean; type: 'boolean' };

export interface SerializedLog {
  /**
   * Timestamp in seconds (epoch time) indicating when the  log occurred.
   */
  timestamp: number;

  /**
   * The severity level of the log. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
   */
  level: LogSeverityLevel;

  /**
   * The log body.
   */
  body: Log['message'];

  /**
   * The trace ID for this log
   */
  trace_id?: string;

  /**
   * Arbitrary structured data that stores information about the log - e.g., userId: 100.
   */
  attributes?: Record<string, SerializedLogAttributeValue>;

  /**
   * The severity number.
   */
  severity_number?: Log['severityNumber'];
}

export type SerializedLogContainer = {
  items: Array<SerializedLog>;
};
