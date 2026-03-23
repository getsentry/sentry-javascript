import { consoleSandbox, defineIntegration } from '@sentry/core';

/**
 * This is a shim for the ElementTiming integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove metrics
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export const elementTimingIntegrationShim = defineIntegration(() => {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('You are using elementTimingIntegration() even though this bundle does not include metrics.');
  });

  return {
    name: 'ElementTiming',
  };
});
