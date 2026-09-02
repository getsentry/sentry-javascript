import { isError } from '@sentry/core';

// Next.js nests the "real" reason in `cause` when an error crosses certain boundaries, and
// `unstable_rethrow` walks that chain. The cap guards against self-referencing causes.
const MAX_CAUSE_DEPTH = 5;

function hasDigest(subject: unknown, predicate: (digest: string) => boolean, depth = 0): boolean {
  if (!isError(subject)) {
    return false;
  }

  const digest = (subject as Error & { digest?: unknown }).digest;
  if (typeof digest === 'string' && predicate(digest)) {
    return true;
  }

  if (depth < MAX_CAUSE_DEPTH && 'cause' in subject) {
    return hasDigest(subject.cause, predicate, depth + 1);
  }

  return false;
}

/**
 * Determines whether input is a Next.js not-found error.
 * https://beta.nextjs.org/docs/api-reference/notfound#notfound
 */
export function isNotFoundNavigationError(subject: unknown): boolean {
  return hasDigest(subject, digest => ['NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404'].includes(digest));
}

/**
 * Determines whether input is a Next.js redirect error.
 * https://beta.nextjs.org/docs/api-reference/redirect#redirect
 */
export function isRedirectNavigationError(subject: unknown): boolean {
  // a redirect digest looks like "NEXT_REDIRECT;[redirect path]"
  return hasDigest(subject, digest => digest.startsWith('NEXT_REDIRECT;'));
}

const PRERENDER_CONTROL_FLOW_DIGESTS = [
  // Next.js hands out promises that never settle (e.g. from `fetch()` under Cache Components) and rejects
  // them once the prerender is aborted. React discards them - anything else observing them must ignore them.
  'HANGING_PROMISE_REJECTION',
  // Thrown to abort a prerender the moment dynamic data is accessed.
  'NEXT_PRERENDER_INTERRUPTED',
  // Thrown to bail out of static generation into dynamic rendering.
  'DYNAMIC_SERVER_USAGE',
  // Thrown by `next/dynamic` to bail out of SSR into client-side rendering.
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
];

/**
 * Determines whether input is one of the errors Next.js throws to steer rendering rather than to signal a failure.
 *
 * This mirrors the non-navigation half of Next.js' `unstable_rethrow`, which is the contract any code wrapping
 * user land in a `try`/`catch` has to honor.
 * https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow
 */
export function isPrerenderControlFlowError(subject: unknown): boolean {
  return hasDigest(subject, digest => PRERENDER_CONTROL_FLOW_DIGESTS.includes(digest));
}
