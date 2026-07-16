/**
 * Virtual module resolved at build time by the `sentrySvelteKit()` Vite plugin to the Svelte 4 or
 * Svelte 5 browser-tracing variant. Both variants export the same `instrumentSvelteKitTracing`.
 */
declare module 'sentry-sveltekit-tracing' {
  import type { Client } from '@sentry/core';

  export function instrumentSvelteKitTracing(
    client: Client,
    options: { instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
  ): void;
}
