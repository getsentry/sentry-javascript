// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/react';

export { init } from './sdk';

type TanStackMiddleware = {
  options: { type: string; server: (...args: unknown[]) => unknown };
  middleware: (...args: unknown[]) => unknown;
  inputValidator: (...args: unknown[]) => unknown;
  client: (...args: unknown[]) => unknown;
  server: (...args: unknown[]) => unknown;
};

type MiddlewareWrapperOptions = {
  name: string;
};

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub allows isomorphic code
 * that imports these functions to build successfully on the client.
 */
export function wrapMiddlewareWithSentry<T extends TanStackMiddleware>(
  middleware: T,
  _options: MiddlewareWrapperOptions,
): T {
  return middleware;
}

/**
 * No-op stub for client-side builds.
 * The actual implementation is server-only, but this stub allows isomorphic code
 * that imports these functions to build successfully on the client.
 */
export function wrapMiddlewareListWithSentry<T extends TanStackMiddleware>(middlewares: Record<string, T>): T[] {
  return Object.values(middlewares);
}
