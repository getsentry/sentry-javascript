import type { HttpError, Redirect } from '@sveltejs/kit';

export const WRAPPED_MODULE_SUFFIX = '?sentry-auto-wrap';

export type SentryWrappedFlag = {
  /**
   * If this flag is set, we know that the load event was already wrapped once
   * and we shouldn't wrap it again.
   */
  __sentry_wrapped__?: true;
};

/**
 * Determines if a thrown "error" is a Redirect object which SvelteKit users can throw to redirect to another route
 * see: https://kit.svelte.dev/docs/modules#sveltejs-kit-redirect
 * @param error the potential redirect error
 */
export function isRedirect(error: unknown): error is Redirect {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  const hasValidLocation = 'location' in error && typeof error.location === 'string';
  const hasValidStatus =
    'status' in error && typeof error.status === 'number' && error.status >= 300 && error.status <= 308;
  return hasValidLocation && hasValidStatus;
}

/**
 * Determines if a thrown "error" is a HttpError
 */
export function isHttpError(err: unknown): err is HttpError {
  return typeof err === 'object' && err !== null && 'status' in err && 'body' in err;
}
