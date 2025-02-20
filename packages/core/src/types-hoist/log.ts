export type LogSeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'critical';

export type LogAttributeValueType =
  | {
      stringValue: string;
    }
  | {
      intValue: number;
    }
  | {
      boolValue: boolean;
    }
  | {
      doubleValue: number;
    };

export type LogAttribute = {
  key: string;
  value: LogAttributeValueType;
};

export interface Log {
  /**
   * Allowed values are, from highest to lowest:
   * `critical`, `fatal`, `error`, `warn`, `info`, `debug`, `trace`.
   *
   * The log level changes how logs are filtered and displayed.
   * Critical level logs are emphasized more than trace level logs.
   *
   * @summary The severity level of the log.
   */
  severityText?: LogSeverityLevel;

  /**
   * The severity number - generally higher severity are levels like 'error' and lower are levels like 'debug'
   */
  severityNumber?: number;

  /**
   * OTEL trace flags (bitmap) - currently 1 means sampled, 0 means unsampled - for sentry always set to 0
   */
  traceFlags?: number;

  /**
   * The trace ID for this log
   */
  traceId?: string;

  /**
   * The message to be logged - for example, 'hello world' would become a log like '[INFO] hello world'
   */
  body: {
    stringValue: string;
  };

  /**
   * Arbitrary structured data that stores information about the log - e.g., userId: 100.
   */
  attributes?: LogAttribute[];

  /**
   * This doesn't have to be explicitly specified most of the time. If you need to set it, the value
   * is the number of seconds since midnight on January 1, 1970 ("unix epoch time")
   *
   * @summary A timestamp representing when the log occurred.
   * @link https://develop.sentry.dev/sdk/event-payloads/breadcrumbs/#:~:text=is%20info.-,timestamp,-(recommended)
   */
  timeUnixNano?: string;
}
