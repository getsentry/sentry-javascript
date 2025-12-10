import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { BrowserOptions as ReactBrowserOptions } from '@sentry/react';
import {
  getDefaultIntegrations as getReactDefaultIntegrations,
  init as initReactSDK,
  tanstackRouterBrowserTracingIntegration,
} from '@sentry/react';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

export type TanStackStartBrowserOptions = ReactBrowserOptions & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router?: any;
};

/**
 * Initializes the TanStack Start React SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: TanStackStartBrowserOptions): Client | undefined {
  const sentryOptions: TanStackStartBrowserOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(sentryOptions, 'tanstackstart-react', ['tanstackstart-react', 'react']);

  return initReactSDK(sentryOptions);
}

function getDefaultIntegrations(options: TanStackStartBrowserOptions): Integration[] {
  const integrations = getReactDefaultIntegrations(options);

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (options.router) {
      integrations.push(tanstackRouterBrowserTracingIntegration(options.router));
    }
  }

  return integrations;
}
