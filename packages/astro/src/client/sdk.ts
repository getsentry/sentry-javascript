import type { BrowserOptions } from '@sentry/browser';
import { BrowserTracing, init as initBrowserSdk } from '@sentry/browser';
import { getCurrentScope, hasTracingEnabled } from '@sentry/core';
import { addOrUpdateIntegration } from '@sentry/utils';

import { applySdkMetadata } from '../common/metadata';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initialize the client side of the Sentry Astro SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): void {
  applySdkMetadata(options, ['astro', 'browser']);

  addClientIntegrations(options);

  initBrowserSdk(options);

  getCurrentScope().setTag('runtime', 'browser');
}

function addClientIntegrations(options: BrowserOptions): void {
  let integrations = options.integrations || [];

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      const defaultBrowserTracingIntegration = new BrowserTracing({});

      integrations = addOrUpdateIntegration(defaultBrowserTracingIntegration, integrations);
    }
  }

  options.integrations = integrations;
}
