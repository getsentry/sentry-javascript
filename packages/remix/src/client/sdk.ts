import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
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
    // The manifest is injected at build time, so route parameterization works from `init` on, even with
    // tracing disabled.
    routeProvider: createRemixRouteProvider(),
    ...options,
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  return reactInit(opts);
}
