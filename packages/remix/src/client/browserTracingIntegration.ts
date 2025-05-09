import type { Integration } from '@sentry/core';
import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import type { RemixBrowserTracingIntegrationOptions } from './performance';
import { setGlobals, startPageloadSpan } from './performance';
/**
 * Creates a browser tracing integration for Remix applications.
 * This integration will create pageload and navigation spans.
 */
export function browserTracingIntegration(options: RemixBrowserTracingIntegrationOptions): Integration {
  const { instrumentPageLoad = true, instrumentNavigation = true, useEffect, useLocation, useMatches } = options;

  setGlobals({
    useEffect,
    useLocation,
    useMatches,
    instrumentNavigation,
  });

  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);

      if (instrumentPageLoad) {
        startPageloadSpan(client);
      }
    },
  };
}
