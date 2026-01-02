import type { BrowserOptions } from '@sentry/browser';
import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowserSdk } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata, parseSpotlightEnvValue, resolveSpotlightValue } from '@sentry/core';
import { browserTracingIntegration } from './browserTracingIntegration';

// Type for spotlight-related env vars injected by Vite
interface SpotlightEnv {
  PUBLIC_SENTRY_SPOTLIGHT?: string;
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

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initialize the client side of the Sentry Astro SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  // Read PUBLIC_SENTRY_SPOTLIGHT (set by spotlight run, Astro uses PUBLIC_ prefix)
  // OR fallback to SENTRY_SPOTLIGHT (injected by our integration)
  const spotlightEnv = getSpotlightEnv();
  const spotlightEnvRaw = spotlightEnv.PUBLIC_SENTRY_SPOTLIGHT || spotlightEnv.SENTRY_SPOTLIGHT;
  const spotlightEnvValue = parseSpotlightEnvValue(spotlightEnvRaw);

  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
    spotlight: resolveSpotlightValue(options.spotlight, spotlightEnvValue),
  };

  applySdkMetadata(opts, 'astro', ['astro', 'browser']);

  return initBrowserSdk(opts);
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    return [...getBrowserDefaultIntegrations(options), browserTracingIntegration()];
  } else {
    return getBrowserDefaultIntegrations(options);
  }
}
