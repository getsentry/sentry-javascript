import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import { instrumentHydratedRouter } from './hydratedRouter';

/**
 * Browser tracing integration for React Router (Framework) applications.
 * This integration will create navigation spans and enhance transactions names with parameterized routes.
 */
export function reactRouterTracingIntegration(): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    // Navigation transactions are started within the hydrated router instrumentation
    instrumentNavigation: false,
  });

  return {
    ...browserTracingIntegrationInstance,
    name: 'ReactRouterTracingIntegration',
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);
      instrumentHydratedRouter();
    },
  };
}
