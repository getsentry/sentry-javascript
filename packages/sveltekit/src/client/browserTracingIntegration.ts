import type { Integration } from '@sentry/core';
import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/svelte';
// The `sentrySvelteKit()` Vite plugin redirects this to the Svelte 4 or Svelte 5 variant per Kit
// version; without the plugin it resolves via `exports` to the Svelte 4 variant, so builds don't break.
import { instrumentSvelteKitTracing } from '@sentry/sveltekit/browser-tracing-variant';

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
