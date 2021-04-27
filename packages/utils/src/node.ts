/**
 * Checks whether we're in the Node.js or Browser environment
 *
 * @returns Answer to given question
 */
export function isNodeEnv(): boolean {
  return Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]';
}

/**
 * Requires a module which is protected against bundler minification.
 *
 * @param request The module path to resolve
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export function dynamicRequire(mod: any, request: string): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return mod.require(request);
}

/**
 * Resolves a module which is protected against bundler minification.
 *
 * @param request The module path to resolve
 * @param options The resolution options
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export function dynamicResolve(mod: any, request: string, options: Record<string, unknown>): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return mod.require.resolve(request, options);
}
