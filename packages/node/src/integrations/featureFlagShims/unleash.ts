import { consoleSandbox, defineIntegration, isBrowser } from '@sentry/core';

/**
 * This is a shim for the Unleash integration.
 * We need this in order to not throw runtime errors when accidentally importing this on the server through a meta framework like Next.js.
 */
export const unleashIntegrationShim = defineIntegration((_options?: unknown) => {
  if (!isBrowser()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('The unleashIntegration() can only be used in the browser.');
    });
  }

  return {
    name: 'Unleash',
  };
});
