import type { Client } from '@sentry/core';
import { applySdkMetadata, GLOBAL_OBJ } from '@sentry/core';
import { init as reactInit } from '@sentry/react';
import type { RemixOptions } from '../utils/remixOptions';
import { createRemixRouteProvider } from './routeProvider';

/**
 * Initializes the Remix SDK.
 * @param options The configuration options.
 * @returns The initialized SDK.
 */
export function init(options: RemixOptions): Client | undefined {
  const release = options.release ?? getReleaseFromRemixContext();
  const opts = {
    // The manifest is injected at build time, so route parameterization works from `init` on, even with
    // tracing disabled.
    routeProvider: createRemixRouteProvider(),
    ...options,
    // Left unset when unknown, so the browser SDK still falls back to an injected `SENTRY_RELEASE`.
    ...(release !== undefined && { release }),
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  return reactInit(opts);
}

/**
 * The Vite plugin adds the release to `window.__remixContext` on the server, so it stays out of the
 * content-hashed client chunks.
 */
function getReleaseFromRemixContext(): string | undefined {
  const release = (GLOBAL_OBJ as { __remixContext?: { sentryRelease?: unknown } }).__remixContext?.sentryRelease;
  return typeof release === 'string' ? release : undefined;
}
