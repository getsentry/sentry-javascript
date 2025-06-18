import type { Contexts, DsnComponents, Primitive, SdkMetadata, Session } from '@sentry/core';

export interface ThreadBlockedIntegrationOptions {
  /**
   * Interval to send heartbeat messages to the watchdog.
   *
   * Defaults to 50ms.
   */
  pollInterval: number;
  /**
   * Threshold in milliseconds to trigger a blocked event.
   *
   * Defaults to 5000ms.
   */
  blockedThreshold: number;
  /**
   * Maximum number of blocked events to send.
   *
   * Defaults to 1.
   */
  maxBlockedEvents: number;
  /**
   * Tags to include with blocked events.
   */
  staticTags: { [key: string]: Primitive };
  /**
   * @ignore Internal use only.
   *
   * If this is supplied, stack frame filenames will be rewritten to be relative to this path.
   */
  appRootPath: string | undefined;
}

export interface WorkerStartData extends ThreadBlockedIntegrationOptions {
  debug: boolean;
  sdkMetadata: SdkMetadata;
  dsn: DsnComponents;
  tunnel: string | undefined;
  release: string | undefined;
  environment: string;
  dist: string | undefined;
  contexts: Contexts;
}

export interface ThreadState {
  session: Session | undefined;
  debugImages: Record<string, string>;
}
