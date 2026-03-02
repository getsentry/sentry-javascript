/**
 * Resolves a navigate argument to a string path.
 *
 * React Router's navigate() accepts a string, number, or To object ({ pathname, search, hash }).
 * This function extracts the pathname from object arguments to avoid "[object Object]" in transaction names.
 */
export function resolveNavigateArg(target: unknown): string {
  if (typeof target === 'object' && target !== null && 'pathname' in target) {
    return (target as { pathname?: string }).pathname || '/';
  }
  return String(target);
}
