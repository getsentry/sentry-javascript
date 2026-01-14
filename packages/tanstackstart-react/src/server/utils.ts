import type { StartSpanOptions } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/node';

/**
 * Extracts the SHA-256 hash from a server function pathname.
 * Server function pathnames are structured as `/_serverFn/<hash>`.
 * This function matches the pattern and returns the hash if found.
 *
 * @param pathname - the pathname of the server function
 * @returns the sha256 of the server function
 */
export function extractServerFunctionSha256(pathname: string): string {
  const serverFnMatch = pathname.match(/\/_serverFn\/([a-f0-9]{64})/i);
  return serverFnMatch?.[1] ?? 'unknown';
}

/**
 * Returns span options for TanStack Start middleware spans.
 */
export function getMiddlewareSpanOptions(name: string): StartSpanOptions {
  return {
    op: 'middleware.tanstackstart',
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual.middleware.tanstackstart',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.tanstackstart',
    },
  };
}
