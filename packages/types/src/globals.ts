/*
 * This file adds variables to the global namespace when it's loaded. We do this in order to be able to use flags and
 * constants to facilitate tree shaking for users without having to import them, since the imports can confuse some
 * tree-shaking algorithms.
 *
 * "Magic strings" like `__DEBUG_BUILD__` are declared here, but only replaced with actual values during our build
 * process.
 *
 * See https://www.typescriptlang.org/docs/handbook/declaration-files/templates/global-modifying-module-d-ts.html and
 * the Debug Build Flags section in CONTRIBUTING.md.
 */

declare global {
  const __DEBUG_BUILD__: boolean;
}

// We need this empty export because of --isolatedModules
export type {};
