import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { BrowserOptions as ReactBrowserOptions } from '@sentry/react';
import { getDefaultIntegrations as getReactDefaultIntegrations, init as initReactSDK } from '@sentry/react';

/**
 * Initializes the TanStack Start React SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: ReactBrowserOptions): Client | undefined {
  const sentryOptions: ReactBrowserOptions = {
    defaultIntegrations: [...getReactDefaultIntegrations(options)],
    ...options,
  };

  applySdkMetadata(sentryOptions, 'tanstackstart-react', ['tanstackstart-react', 'react']);

  return initReactSDK(sentryOptions);
}
