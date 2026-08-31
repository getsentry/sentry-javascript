import { getDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, setNormalizeStringifier, setRouteProvider } from '@sentry/core/browser';

import { vueIntegration } from './integration';
import type { Options } from './types';
import { normalizeStringifyValue } from './normalizeStringifyValue';
import { createVueRouteProvider, getRouterFromApp } from './routeProvider';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const opts = {
    defaultIntegrations: [...getDefaultIntegrations(options), vueIntegration()],
    ...options,
  };

  applySdkMetadata(opts, 'vue');

  const client = browserInit(opts);

  // Registered here rather than from `browserTracingIntegration` so route parameterization does not
  // depend on tracing. The router is read off the app the SDK is already given, so users who never
  // pass `router` to the tracing integration still get parameterized routes.
  setRouteProvider(
    createVueRouteProvider(() => getRouterFromApp(opts.app)),
    client,
  );

  // Add vue-specific stringification
  setNormalizeStringifier(normalizeStringifyValue);

  return client;
}
