import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import type { Integration } from '@sentry/types';
import { setGlobals, startPageloadSpan } from './performance';
import type { RemixBrowserTracingIntegrationOptions } from './performance';
/**
 * Creates a browser tracing integration for Remix applications.
 * This integration will create pageload and navigation spans.
 */
export function browserTracingIntegration(options: RemixBrowserTracingIntegrationOptions): Integration {
  if (options.startTransactionOnPageLoad === undefined) {
    options.startTransactionOnPageLoad = true;
  }

  if (options.startTransactionOnLocationChange === undefined) {
    options.startTransactionOnLocationChange = true;
  }

  setGlobals({
    useEffect: options.useEffect,
    useLocation: options.useLocation,
    useMatches: options.useMatches,
    startTransactionOnLocationChange: options.startTransactionOnLocationChange,
  });

  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup?.(client);

      if (options.startTransactionOnPageLoad) {
        startPageloadSpan();
      }
    },
  };
}
