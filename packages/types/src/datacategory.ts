// This type is used in various places like Client Reports and Rate Limit Categories
// See:
// - https://develop.sentry.dev/sdk/rate-limiting/#definitions
// - https://github.com/getsentry/relay/blob/ec791fed9c2260688f25ea6a6d53ab913927e9a5/relay-base-schema/src/data_category.rs#L91
// - https://develop.sentry.dev/sdk/client-reports/#envelope-item-payload under `discarded_events`
export type DataCategory =
  // Reserved and only used in edgecases, unlikely to be ever actually used
  | 'default'
  // Error events
  | 'error'
  // Transaction type event
  | 'transaction'
  // Replay type event
  | 'replay'
  // Events with `event_type` csp, hpkp, expectct, expectstaple
  | 'security'
  // Attachment bytes stored (unused for rate limiting
  | 'attachment'
  // Session update events
  | 'session'
  // SDK internal event, like client_reports
  | 'internal'
  // Profile event type
  | 'profile'
  // Check-in event (monitor)
  | 'monitor'
  // Feedback type event (v2)
  | 'feedback'
  // Metrics sent via the statsd or metrics envelope items
  | 'metric_bucket'
  // Span
  | 'span'
  // Unknown data category
  | 'unknown';
