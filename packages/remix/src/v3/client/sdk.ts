import type { BrowserOptions } from '@sentry/browser';
import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as browserInit } from '@sentry/browser';
import { applySdkMetadata, type Client, type Integration } from '@sentry/core';

import { browserTracingIntegration } from './browserTracingIntegration';
import { instrumentClientRuntime } from './errors';

/**
 * Default integrations for the Remix 3 client SDK.
 *
 * Browser tracing is added here rather than left to the app, because the Navigation API variant is the
 * only one that reports anything in Remix 3. Everything else is plain `@sentry/browser`. Nothing from
 * `@sentry/react` applies: `remix/ui` is its own runtime, with no React and no reconciler to hook.
 */
export function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  return [...getBrowserDefaultIntegrations(options), browserTracingIntegration()];
}

/** Initialize the Sentry Remix 3 SDK in the browser. */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
    defaultIntegrations: options.defaultIntegrations ?? getDefaultIntegrations(options),
  };

  applySdkMetadata(opts, 'remix', ['remix', 'browser']);

  const client = browserInit(opts);

  // Subscribed before the app calls `run()`, so an app served through an instrumented asset server
  // reports component errors without writing any Sentry code itself.
  instrumentClientRuntime();

  return client;
}
