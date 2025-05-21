import type { BrowserOptions } from '@sentry/browser';
import {
  BrowserClient,
  browserTracingIntegration,
  defaultStackParser,
  getDefaultIntegrations as getBrowserDefaultIntegrations,
  makeFetchTransport,
} from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata, getClientOptions, initAndBind } from '@sentry/core';

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initialize the client side of the Sentry Astro SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const clientOptions = getClientOptions(options, {
    integrations: getDefaultIntegrations(options),
    stackParser: defaultStackParser,
    transport: makeFetchTransport,
  });

  applySdkMetadata(clientOptions, 'astro', ['astro', 'browser']);

  return initAndBind(BrowserClient, clientOptions);
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
