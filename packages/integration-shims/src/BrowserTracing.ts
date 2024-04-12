import { defineIntegration } from '@sentry/core';
import { consoleSandbox } from '@sentry/utils';

/**
 * This is a shim for the BrowserTracing integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove tracing
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export const browserTracingIntegrationShim = defineIntegration((_options?: unknown) => {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('You are using browserTracingIntegration() even though this bundle does not include tracing.');
  });

  return {
    name: 'BrowserTracing',
  };
});
