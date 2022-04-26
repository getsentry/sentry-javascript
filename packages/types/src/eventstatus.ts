export type EventStatus =
  /** The status could not be determined. */
  | 'unknown'
  /** The client is currently rate limited and will try again later. */
  | 'rate_limit'
  /** The event could not be processed. */
  | 'invalid'
  /** A server-side error occurred during submission. */
  | 'failed'
  /** The event was sent to Sentry successfully. */
  | 'success';
