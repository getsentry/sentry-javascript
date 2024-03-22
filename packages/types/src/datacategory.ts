// This type is used in various places like Client Reports and Rate Limit Categories
// See:
// - https://develop.sentry.dev/sdk/rate-limiting/#definitions
// - https://github.com/getsentry/relay/blob/c3b339e151c1e548ede489a01c65db82472c8751/relay-common/src/constants.rs#L139-L152
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
  // Statsd type event for metrics
  | 'statsd'
  // Unknown data category
  | 'unknown';
