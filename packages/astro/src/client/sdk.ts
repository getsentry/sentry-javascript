import type { BrowserOptions } from '@sentry/browser';
import {
  browserTracingIntegration,
  getDefaultIntegrations as getBrowserDefaultIntegrations,
  init as initBrowserSdk,
  setTag,
} from '@sentry/browser';
import { applySdkMetadata, hasTracingEnabled } from '@sentry/core';
import type { Integration } from '@sentry/types';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initialize the client side of the Sentry Astro SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): void {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'astro', ['astro', 'browser']);

  initBrowserSdk(opts);

  setTag('runtime', 'browser');
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] | undefined {
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      return [...getBrowserDefaultIntegrations(options), browserTracingIntegration()];
    }
  }

  return undefined;
}
