import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, parseSpotlightEnvValue, resolveSpotlightValue } from '@sentry/core';

// Build-time placeholder - Rollup replaces per output format
// ESM: import.meta.env?.VITE_SENTRY_SPOTLIGHT (zero-config for Vite)
// CJS: undefined
declare const __VITE_SPOTLIGHT_ENV__: string | undefined;

/**
 * Inits the Svelte SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
  };

  // Check for spotlight env vars:
  // 1. process.env.SENTRY_SPOTLIGHT (all bundlers, requires config)
  // 2. process.env.VITE_SENTRY_SPOTLIGHT (all bundlers, requires config)
  // 3. import.meta.env.VITE_SENTRY_SPOTLIGHT (ESM only, zero-config for Vite!)
  const spotlightEnvRaw =
    (typeof process !== 'undefined' && (process.env?.SENTRY_SPOTLIGHT || process.env?.VITE_SENTRY_SPOTLIGHT)) ||
    (typeof __VITE_SPOTLIGHT_ENV__ !== 'undefined' && __VITE_SPOTLIGHT_ENV__) ||
    undefined;

  if (spotlightEnvRaw) {
    const envValue = parseSpotlightEnvValue(spotlightEnvRaw);
    opts.spotlight = resolveSpotlightValue(options.spotlight, envValue);
  }

  applySdkMetadata(opts, 'svelte');

  return browserInit(opts);
}
