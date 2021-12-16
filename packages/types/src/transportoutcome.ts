/** JSDoc
 * @deprecated Use string literals - if you require type casting, cast to Outcome type
 */
export enum Outcome {
  BeforeSend = 'before_send',
  EventProcessor = 'event_processor',
  NetworkError = 'network_error',
  QueueOverflow = 'queue_overflow',
  RateLimitBackoff = 'ratelimit_backoff',
  SampleRate = 'sample_rate',
}
