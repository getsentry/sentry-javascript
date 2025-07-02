import { consoleSandbox, defineIntegration, isBrowser } from '@sentry/core';

/**
 * This is a shim for the OpenFeature integration.
 * We need this in order to not throw runtime errors when accidentally importing this on the server through a meta framework like Next.js.
 */
export const openFeatureIntegrationShim = defineIntegration((_options?: unknown) => {
  if (!isBrowser()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('The openFeatureIntegration() can only be used in the browser.');
    });
  }

  return {
    name: 'OpenFeature',
  };
});

/**
 * This is a shim for the OpenFeature integration hook.
 */
export class OpenFeatureIntegrationHookShim {
  /**
   *
   */
  public constructor() {
    if (!isBrowser()) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('The OpenFeatureIntegrationHook can only be used in the browser.');
      });
    }
  }

  /**
   *
   */
  public after(): void {
    // No-op
  }

  /**
   *
   */
  public error(): void {
    // No-op
  }
}
