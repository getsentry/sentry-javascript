// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import type {
  SentryGlobalFunctionMiddleware,
  SentryGlobalRequestMiddleware,
  TanStackMiddlewareBase,
} from '../common/types';
import type { CreateSentryTunnelRouteOptions } from '../server/tunnelRoute';

export * from '@sentry/react';
// Optional browser features and router helpers are no longer star-exported through
// `@sentry/react`. Re-export them so `import * as Sentry from '@sentry/tanstackstart-react'`
// keeps the historical surface (including `tanstackRouterBrowserTracingIntegration`,
// which is dual-declared against the client SDK in `index.types.ts`).
export * from '@sentry/react/optional-browser-api';
// `uiProfiler` is on both `@sentry/react` and `optional-browser-api`; dual
// `export *` would omit the name under ESM rules, so re-export it explicitly.
export { uiProfiler } from '@sentry/react';
export { tanstackRouterBrowserTracingIntegration } from '@sentry/react/tanstackrouter';

export { init } from './sdk';

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub is needed to prevent build errors.
 */
export function wrapMiddlewaresWithSentry<T extends TanStackMiddlewareBase>(middlewares: Record<string, T>): T[] {
  return Object.values(middlewares);
}

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub is needed to prevent rendering errors.
 */
export const sentryGlobalRequestMiddleware: SentryGlobalRequestMiddleware = {
  '~types': undefined as unknown as SentryGlobalRequestMiddleware['~types'],
  _types: undefined as unknown as SentryGlobalRequestMiddleware['_types'],
  options: {},
};

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub is needed to prevent rendering errors.
 */
export const sentryGlobalFunctionMiddleware: SentryGlobalFunctionMiddleware = {
  '~types': undefined as unknown as SentryGlobalFunctionMiddleware['~types'],
  _types: undefined as unknown as SentryGlobalFunctionMiddleware['_types'],
  options: {},
};

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub is needed to prevent rendering errors.
 */
export function createSentryTunnelRoute(_options: CreateSentryTunnelRouteOptions): {
  handlers: {
    POST: () => Promise<Response>;
  };
} {
  return {
    handlers: {
      POST: async () => new Response(null, { status: 500 }),
    },
  };
}

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub is needed so the managed tunnel route module
 * can statically import it (the call is server-guarded and tree-shaken from the client bundle).
 */
export function registerSentryServerTunnelRoute(_path: string): void {}
