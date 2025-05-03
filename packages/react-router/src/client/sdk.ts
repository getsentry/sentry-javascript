import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, setTag } from '@sentry/core';
import { BROWSER_TRACING_INTEGRATION_ID } from '../../../browser/build/npm/types/tracing/browserTracingIntegration';
import { reactRouterTracingIntegration } from './tracingIntegration';

/**
 * Initializes the client side of the React Router SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  // If BrowserTracing integration was passed to options, replace it with React Router tracing integration
  if (options.integrations && Array.isArray(options.integrations)) {
    const hasBrowserTracing = options.integrations.some(
      integration => integration.name === BROWSER_TRACING_INTEGRATION_ID,
    );
    if (hasBrowserTracing) {
      options.integrations = options.integrations.filter(
        integration => integration.name !== BROWSER_TRACING_INTEGRATION_ID,
      );
      options.integrations.push(reactRouterTracingIntegration());
    }
  }

  applySdkMetadata(options, 'react-router', ['react-router', 'browser']);

  const client = browserInit(options);

  setTag('runtime', 'browser');

  return client;
}
