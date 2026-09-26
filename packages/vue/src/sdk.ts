import { getDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, setNormalizeStringifier } from '@sentry/core';

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
    // The router is read off the app on each call, so `app.use(router)` can run either side of `init`, and
    // users who never pass `router` to the tracing integration still get parameterized routes.
    ...(options.app && { routeProvider: createVueRouteProvider(() => getRouterFromApp(options.app)) }),
    ...options,
  };

  applySdkMetadata(opts, 'vue');

  const client = browserInit(opts);

  // Add vue-specific stringification
  setNormalizeStringifier(normalizeStringifyValue);

  return client;
}
