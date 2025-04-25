import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { BrowserOptions } from '@sentry/solid';
import {
  browserTracingIntegration,
  getDefaultIntegrations as getDefaultSolidIntegrations,
  init as initSolidSDK,
} from '@sentry/solid';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initializes the client side of the Solid Start SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'solidstart', ['solidstart', 'solid']);

  return initSolidSDK(opts);
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  const integrations = getDefaultSolidIntegrations(options);

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    // We add the default BrowserTracingIntegration here always.
    // We can do this, even if `solidRouterBrowserTracingIntegration` is
    // supplied as integration in `init` by users because it will win
    // over the default integration by virtue of having the same
    // `BrowserTracing` integration name and being added later.
    integrations.push(browserTracingIntegration());
  }

  return integrations;
}
