import type { ParameterizedString } from './parameterize';

export type LogSeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type SerializedLogAttributeValueType =
  | {
      stringValue: string;
    }
  | {
      // integers must be represented as a string
      // because JSON cannot differentiate between integers and floats
      intValue: string;
    }
  | {
      boolValue: boolean;
    }
  | {
      doubleValue: number;
    };

export type SerializedLogAttribute = {
  key: string;
  value: SerializedLogAttributeValueType;
};

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
   * The message to be logged - for example, 'hello world' would become a log like '[INFO] hello world'
   */
  message: ParameterizedString;

  /**
   * Arbitrary structured data that stores information about the log - e.g., userId: 100.
   */
  attributes?: Record<string, unknown>;

  /**
   * The severity number - generally higher severity are levels like 'error' and lower are levels like 'debug'
   */
  severityNumber?: number;
}

export interface SerializedOtelLog {
  severityText?: Log['level'];

  /**
   * The trace ID for this log
   */
  traceId?: string;

  severityNumber?: Log['severityNumber'];

  body: {
    stringValue: Log['message'];
  };

  /**
   * Arbitrary structured data that stores information about the log - e.g., userId: 100.
   */
  attributes?: SerializedLogAttribute[];

  /**
   * This doesn't have to be explicitly specified most of the time. If you need to set it, the value
   * is the number of seconds since midnight on January 1, 1970 ("unix epoch time")
   *
   * @summary A timestamp representing when the log occurred.
   * @link https://develop.sentry.dev/sdk/event-payloads/breadcrumbs/#:~:text=is%20info.-,timestamp,-(recommended)
   */
  timeUnixNano?: string;
}
