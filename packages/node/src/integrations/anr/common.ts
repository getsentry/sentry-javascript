import type { Contexts, DsnComponents, Primitive, SdkMetadata } from '@sentry/types';

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
   * Whether to capture a stack trace when the ANR event is triggered.
   *
   * Defaults to `false`.
   *
   * This uses the node debugger which enables the inspector API and opens the required ports.
   */
  captureStackTrace: boolean;
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
  sdkMetadata: SdkMetadata;
  dsn: DsnComponents;
  tunnel: string | undefined;
  release: string | undefined;
  environment: string;
  dist: string | undefined;
  contexts: Contexts;
}
