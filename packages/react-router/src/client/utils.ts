import { getAbsoluteUrl } from '@sentry/browser';
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

function getNavigateBaseUrl(currentUrl?: string): string {
  const origin = WINDOW.location?.origin || 'http://localhost';

  // Prefer the live pathname, but fall back to the hook-provided `currentUrl` (which may be a full
  // URL or a bare path) when `location` is unavailable (e.g. SSR/non-browser environments).
  let pathname = WINDOW.location?.pathname;
  if (!pathname && currentUrl) {
    try {
      pathname = new URL(currentUrl, origin).pathname;
    } catch {
      pathname = currentUrl.startsWith('/') ? currentUrl : `/${currentUrl}`;
    }
  }
  pathname = pathname || '/';

  // React Router resolves relative navigate targets against the current path treated as a
  // *directory* (it appends segments), whereas the WHATWG `URL` parser treats the last path
  // segment as a file and drops it. Enforce a trailing slash so relative resolution matches
  // React Router, e.g. `navigate('ssr')` from `/performance` -> `/performance/ssr` (not `/ssr`).
  const directory = pathname.endsWith('/') ? pathname : `${pathname}/`;

  return `${origin}${directory}`;
}

/**
 * Resolves a navigate argument to an absolute URL for `url.full`/`url.path`, correctly handling
 * relative targets (no leading slash) by resolving them against the current URL instead of the
 * document origin alone.
 */
export function resolveNavigateAbsoluteUrl(target: unknown, currentUrl?: string): string {
  const destination = resolveNavigateUrl(target);

  try {
    const resolved = new URL(destination, getNavigateBaseUrl(currentUrl));
    return getAbsoluteUrl(`${resolved.pathname}${resolved.search}${resolved.hash}`);
  } catch {
    return getAbsoluteUrl(destination);
  }
}
