import { consoleSandbox, defineIntegration } from '@sentry/core';

/**
 * This is a shim for the FetchStreamPerformance integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove this integration
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export const fetchStreamPerformanceIntegrationShim = defineIntegration(() => {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      'You are using fetchStreamPerformanceIntegration() even though this bundle does not include tracing.',
    );
  });

  return {
    name: 'FetchStreamPerformance',
  };
});
