import type { HttpError, Redirect } from '@sveltejs/kit';

export const WRAPPED_MODULE_SUFFIX = '?sentry-auto-wrap';

export type SentryWrappedFlag = {
  /**
   * If this flag is set, we know that the load event was already wrapped once
   * and we shouldn't wrap it again.
   */
  __sentry_wrapped__?: true;
};

interface EventLike {
  route?: {
    id?: string | null;
  };
  untrack<T>(fn: () => T): T;
}

/**
 * Get route.id from a load event without triggering SvelteKit's route proxy
 * (which would cause unwanted invalidations). Uses `untrack` when available (SvelteKit 2+),
 * otherwise falls back to getOwnPropertyDescriptor for SvelteKit 1.x.
 */
export function getRouteId(event: EventLike): string | void {
  if (typeof event.untrack === 'function') {
    return event.untrack(() => event.route?.id ?? undefined);
  }

  const route = event.route;
  if (!route) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(route, 'id');
  const fromDescriptor = descriptor?.value as string | null | undefined;

  if (fromDescriptor !== undefined && fromDescriptor !== null) {
    return fromDescriptor;
  }

  return;
}

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
