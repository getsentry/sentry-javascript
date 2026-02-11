import * as Sentry from '@sentry/browser';
import { applySdkMetadata, type Client } from '@sentry/core';

import type { BrowserOptions } from '@sentry/browser';

/**
 * Initialize the Sentry SDK for Ember.
 *
 * This should be called early in your application's startup, typically in app/app.ts
 * before your Application class is defined.
 *
 * @param config - Sentry browser options
 * @returns The Sentry client instance
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/ember';
 *
 * Sentry.init({
 *   dsn: 'YOUR_DSN_HERE',
 *   tracesSampleRate: 1.0,
 * });
 * ```
 */
export function init(config?: BrowserOptions): Client | undefined {
  const initConfig = { ...config };

  applySdkMetadata(initConfig, 'ember');

  return Sentry.init(initConfig);
}
