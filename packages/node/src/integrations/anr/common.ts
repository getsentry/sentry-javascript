import type { Primitive } from '@sentry/types';

export interface AnrIntegrationOptions {
  /**
   * Interval to send heartbeat messages to the ANR worker.
   *
   * Defaults to 50ms.
   */
  pollInterval: number;
  /**
   * Threshold in milliseconds to trigger an ANR event.
   *
   * Defaults to 5000ms.
   */
  anrThreshold: number;
  /**
   * Tags to include with ANR events.
   */
  staticTags: { [key: string]: Primitive };
  /**
   * @ignore Internal use only.
   *
   * If this is supplied, stack frame filenames will be rewritten to be relative to this path.
   */
  appRootPath: string | undefined;
}

export interface WorkerStartData extends AnrIntegrationOptions {
  debug: boolean;
}
