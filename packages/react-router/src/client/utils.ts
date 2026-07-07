import { GLOBAL_OBJ } from '@sentry/core';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

/**
 * Resolves a navigate argument to a pathname string.
 *
 * React Router's navigate() accepts a string, number, or a To object ({ pathname, search, hash }).
 * All fields in the To object are optional (Partial<Path>), so we need to detect object args
 * to avoid "[object Object]" transaction names.
 */
export function resolveNavigateArg(target: unknown): string {
  if (typeof target !== 'object' || target === null) {
    // string or number
    return String(target);
  }

  // Object `to` with pathname
  const pathname = (target as Record<string, unknown>).pathname;
  if (typeof pathname === 'string') {
    return pathname || '/';
  }

  // Object `to` without pathname - navigation stays on current path
  return WINDOW.location?.pathname || '/';
}

/**
 * Resolves a navigate argument to the full destination path, preserving `search`/`hash` from a
 * To object. Unlike `resolveNavigateArg` (used for span/route naming, which should stay a bare
 * path), this is used to derive `url.full`/`url.path`, which should reflect the actual
 * destination the user is navigating to, including any query string.
 */
export function resolveNavigateUrl(target: unknown): string {
  if (typeof target !== 'object' || target === null) {
    // string or number
    return String(target);
  }

  const { pathname, search, hash } = target as Record<string, unknown>;
  const path = typeof pathname === 'string' && pathname !== '' ? pathname : WINDOW.location?.pathname || '/';

  return `${path}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`;
}
