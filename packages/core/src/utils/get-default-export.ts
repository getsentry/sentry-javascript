/**
 * Often we patch a module's default export, but we want to be able to do
 * something like this:
 *
 * ```ts
 * patchTheThing(await import('the-thing'));
 * ```
 *
 * Or like this:
 *
 * ```ts
 * import theThing from 'the-thing';
 * patchTheThing(theThing);
 * ```
 */
export function getDefaultExport<T>(moduleExport: T | { default: T }): T {
  return (
    (!!moduleExport &&
      typeof moduleExport === 'object' &&
      'default' in moduleExport &&
      (moduleExport as { default: T }).default) ||
    (moduleExport as T)
  );
}
