import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata, getClientOptions, initAndBind } from '@sentry/core';
import { defaultStackParser } from '@sentry/node';
import type { BrowserOptions } from '@sentry/solid';
import {
  BrowserClient,
  browserTracingIntegration,
  getDefaultIntegrations as getDefaultSolidIntegrations,
  makeFetchTransport,
} from '@sentry/solid';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initializes the client side of the Solid Start SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const clientOptions = getClientOptions(options, {
    integrations: getDefaultIntegrations(options),
    stackParser: defaultStackParser,
    transport: makeFetchTransport,
  });

  applySdkMetadata(clientOptions, 'solidstart', ['solidstart', 'solid']);

  return initAndBind(BrowserClient, clientOptions);
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
