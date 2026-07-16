import type { Integration } from '@sentry/core';
import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/svelte';
// Resolved by the `sentrySvelteKit()` Vite plugin to the Svelte 4 (`$app/stores`) or Svelte 5
// (`$app/state`) variant, so the right one is bundled eagerly while both stay supported.
import { instrumentSvelteKitTracing } from 'sentry-sveltekit-tracing';

/**
 * A custom `BrowserTracing` integration for SvelteKit.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const integration = {
    ...originalBrowserTracingIntegration({
      ...options,
      instrumentNavigation: false,
      instrumentPageLoad: false,
    }),
  };

  return {
    ...integration,
    afterAllSetup: client => {
      integration.afterAllSetup(client);
      instrumentSvelteKitTracing(client, options);
    },
  };
}
