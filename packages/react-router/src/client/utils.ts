import { GLOBAL_OBJ } from '@sentry/core';

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
  return (GLOBAL_OBJ as typeof GLOBAL_OBJ & Window).location?.pathname || '/';
}
