import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import type { Integration } from '@sentry/types';
import { setGlobals, startPageloadSpan } from './performance';
import type { RemixBrowserTracingIntegrationOptions } from './performance';
/**
 * Creates a browser tracing integration for Remix applications.
 * This integration will create pageload and navigation spans.
 */
export function browserTracingIntegration(options: RemixBrowserTracingIntegrationOptions): Integration {
  if (options.instrumentPageLoad === undefined) {
    options.instrumentPageLoad = true;
  }

  if (options.instrumentNavigation === undefined) {
    options.instrumentNavigation = true;
  }

  setGlobals({
    useEffect: options.useEffect,
    useLocation: options.useLocation,
    useMatches: options.useMatches,
    instrumentNavigation: options.instrumentNavigation,
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

      if (options.instrumentPageLoad) {
        startPageloadSpan();
      }
    },
  };
}
