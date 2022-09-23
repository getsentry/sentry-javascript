/**
 * Returns true if we are currently recording an internal to Sentry replay
 * (e.g. on https://sentry.io )
 */
export function isInternal() {
  return ['sentry.io', 'dev.getsentry.net'].includes(window.location.host);
}
