import type { BrowserOptions } from '@sentry/browser';
import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowserSdk } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { browserTracingIntegration } from './browserTracingIntegration';

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initialize the client side of the Sentry Astro SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'astro', ['astro', 'browser']);

  return initBrowserSdk(opts);
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    return [...getBrowserDefaultIntegrations(options), browserTracingIntegration()];
  } else {
    return getBrowserDefaultIntegrations(options);
  }
}
