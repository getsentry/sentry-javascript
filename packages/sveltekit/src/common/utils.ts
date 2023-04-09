import type { Redirect } from '@sveltejs/kit';

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
