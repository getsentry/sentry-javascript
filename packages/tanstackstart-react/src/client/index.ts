// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
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
