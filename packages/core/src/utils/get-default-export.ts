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
 *
 * Note: this does not support modules with a falsey default export. However,
 * presumably in those cases, there's no default export to patch anyway.
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
