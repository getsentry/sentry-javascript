// This type is used in various places like Client Reports and Rate Limit Categories
// See:
// - https://develop.sentry.dev/sdk/rate-limiting/#definitions
// - https://github.com/getsentry/relay/blob/10874b587bb676bd6d50ad42d507216513660082/relay-common/src/constants.rs#L97-L113
// - https://develop.sentry.dev/sdk/client-reports/#envelope-item-payload under `discarded_events`
export type DataCategory =
  // Reserved and only used in edgecases, unlikely to be ever actually used
  | 'default'
  // Error events
  | 'error'
  // Transaction type event
  | 'transaction'
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
  // Replay event types
  | 'replay_event'
  | 'replay_recording';
