import type { Contexts, DsnComponents, Primitive, SdkMetadata, Session } from '@sentry/core';

export const POLL_RATIO = 2;

export interface ThreadBlockedIntegrationOptions {
  /**
   * Threshold in milliseconds to trigger an event.
   *
   * Defaults to 1000ms.
   */
  threshold: number;
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
