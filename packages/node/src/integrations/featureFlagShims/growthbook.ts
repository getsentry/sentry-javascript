import { consoleSandbox, defineIntegration, isBrowser } from '@sentry/core';

/**
 * Shim for the GrowthBook integration to avoid runtime errors when imported on the server.
 */
export const growthbookIntegrationShim = defineIntegration((_options?: unknown) => {
  if (!isBrowser()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('The growthbookIntegration() can only be used in the browser.');
    });
  }

  return {
    name: 'GrowthBook',
  };
});
