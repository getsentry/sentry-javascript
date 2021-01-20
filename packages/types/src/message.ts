/**
 * The Message Interface carries a log message that describes an event or error.
 * Optionally, it can carry a format string and structured parameters.
 * This can help to group similar messages into the same issue.
 * @external https://develop.sentry.dev/sdk/event-payloads/message/
 */
export interface Message {
  /**
   * The fully formatted message.
   * If missing, Sentry will try to interpolate the message.
   * It must not exceed 8192 characters. Longer messages will be truncated.
   */
  formatted?: string;

  /**
   * The raw message string (uninterpolated).
   * It must not exceed 8192 characters. Longer messages will be truncated.
   */
  message?: string;

  /**
   * A list of formatting parameters.
   */
  params?: string[];
}
