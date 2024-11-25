import { isError } from '@sentry/core';

/**
 * Determines whether input is a Next.js not-found error.
 * https://beta.nextjs.org/docs/api-reference/notfound#notfound
 */
export function isNotFoundNavigationError(subject: unknown): boolean {
  return (
    isError(subject) &&
    ['NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404'].includes(
      (subject as Error & { digest?: unknown }).digest as string,
    )
  );
}

/**
 * Determines whether input is a Next.js redirect error.
 * https://beta.nextjs.org/docs/api-reference/redirect#redirect
 */
export function isRedirectNavigationError(subject: unknown): boolean {
  return (
    isError(subject) &&
    typeof (subject as Error & { digest?: unknown }).digest === 'string' &&
    (subject as Error & { digest: string }).digest.startsWith('NEXT_REDIRECT;') // a redirect digest looks like "NEXT_REDIRECT;[redirect path]"
  );
}
