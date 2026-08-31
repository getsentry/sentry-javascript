import type { Client } from '@sentry/core';
import { applySdkMetadata, setRouteProvider } from '@sentry/core';
import { init as reactInit } from '@sentry/react';
import type { RemixOptions } from '../utils/remixOptions';
import { createRemixRouteProvider } from './routeProvider';

/**
 * Initializes the Remix SDK.
 * @param options The configuration options.
 * @returns The initialized SDK.
 */
export function init(options: RemixOptions): Client | undefined {
  const opts = {
    ...options,
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  const client = reactInit(opts);

  // Registered here rather than from the tracing integration so route parameterization does not
  // depend on tracing: the manifest is injected at build time, so anything that needs a route name
  // (bfcache metrics, web vitals) can resolve one even with tracing disabled.
  setRouteProvider(createRemixRouteProvider(), client);

  return client;
}
