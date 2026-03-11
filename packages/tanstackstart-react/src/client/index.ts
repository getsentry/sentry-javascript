
import type { TanStackMiddlewareBase } from '../common/types';

export * from '@sentry/react';

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
export const sentryGlobalRequestMiddleware: TanStackMiddlewareBase = { '~types': undefined, options: {} };

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub is needed to prevent rendering errors.
 */
export const sentryGlobalFunctionMiddleware: TanStackMiddlewareBase = { '~types': undefined, options: {} };
