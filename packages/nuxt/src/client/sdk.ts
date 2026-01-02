import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowser } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, parseSpotlightEnvValue, resolveSpotlightValue } from '@sentry/core';
import type { SentryNuxtClientOptions } from '../common/types';

// Type for spotlight-related env vars injected by Vite
interface SpotlightEnv {
  VITE_SENTRY_SPOTLIGHT?: string;
  SENTRY_SPOTLIGHT?: string;
}

// Access import.meta.env in a way that works with TypeScript
// Vite replaces this at build time
function getSpotlightEnv(): SpotlightEnv {
  try {
    // @ts-expect-error - import.meta.env is injected by Vite
    return typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env as SpotlightEnv) : {};
  } catch {
    return {};
  }
}

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtClientOptions): Client | undefined {
  // Read VITE_SENTRY_SPOTLIGHT (set by spotlight run, auto-exposed by Vite)
  // OR fallback to SENTRY_SPOTLIGHT (injected by our module)
  const spotlightEnv = getSpotlightEnv();
  const spotlightEnvRaw = spotlightEnv.VITE_SENTRY_SPOTLIGHT || spotlightEnv.SENTRY_SPOTLIGHT;
  const spotlightEnvValue = parseSpotlightEnvValue(spotlightEnvRaw);

  const sentryOptions = {
    /* BrowserTracing is added later with the Nuxt client plugin */
    defaultIntegrations: [...getBrowserDefaultIntegrations(options)],
    ...options,
    spotlight: resolveSpotlightValue(options.spotlight, spotlightEnvValue),
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}
