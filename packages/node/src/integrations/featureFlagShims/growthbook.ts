import {
  defineIntegration,
  growthbookIntegration as coreGrowthbookIntegration,
  isBrowser,
} from '@sentry/core';

/**
 * Shim for the GrowthBook integration to avoid runtime errors when imported on the server.
 */
export const growthbookIntegrationShim = defineIntegration(
  (options: Parameters<typeof coreGrowthbookIntegration>[0]) => {
    if (!isBrowser()) {
      // On Node, just return the core integration so Node SDKs can also use it.
      return coreGrowthbookIntegration(options);
    }

    // In browser, still return the integration to preserve behavior.
    return coreGrowthbookIntegration(options);
  },
);
