// https://develop.sentry.dev/sdk/check-ins/
export interface CheckIn {
  // Check-In ID (unique and client generated).
  check_in_id: string;
  // The distinct slug of the monitor.
  monitor_slug: string;
  // The status of the check-in.
  status: 'in_progress' | 'ok' | 'error';
  // The duration of the check-in in seconds. Will only take effect if the status is ok or error.
  duration?: number;
  release?: string;
  environment?: string;
}
