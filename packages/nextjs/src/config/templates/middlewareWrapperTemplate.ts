/*
 * This file is a template for the code which will be substituted when our webpack loader handles middleware files.
 *
 * We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped. Because it's not a real package,
 * this causes both TS and ESLint to complain, hence the pragma comments below.
 */

// @ts-expect-error See above
import * as origModule from '__SENTRY_WRAPPING_TARGET_FILE__';
import * as Sentry from '@sentry/nextjs';
import type { EdgeRouteHandler } from '../../edge/types';

type NextApiModule =
  | {
      // ESM export
      default?: EdgeRouteHandler;
      middleware?: EdgeRouteHandler;
      proxy?: EdgeRouteHandler;
    }
  // CJS export
  | EdgeRouteHandler;

const userApiModule = origModule as NextApiModule;

// Default to undefined. It's possible for Next.js users to not define any exports/handlers in an API route. If that is
// the case Next.js wil crash during runtime but the Sentry SDK should definitely not crash so we need tohandle it.
let userProvidedNamedHandler: EdgeRouteHandler | undefined = undefined;
let userProvidedDefaultHandler: EdgeRouteHandler | undefined = undefined;
let userProvidedMiddleware = false;
let userProvidedProxy = false;

if ('middleware' in userApiModule && typeof userApiModule.middleware === 'function') {
  // Handle when user defines via named ESM export: `export { middleware };`
  userProvidedNamedHandler = userApiModule.middleware;
  userProvidedMiddleware = true;
} else if ('proxy' in userApiModule && typeof userApiModule.proxy === 'function') {
  // Handle when user defines via named ESM export (Next.js 16): `export { proxy };`
  userProvidedNamedHandler = userApiModule.proxy;
  userProvidedProxy = true;
} else if ('default' in userApiModule && typeof userApiModule.default === 'function') {
  // Handle when user defines via ESM export: `export default myFunction;`
  userProvidedDefaultHandler = userApiModule.default;
} else if (typeof userApiModule === 'function') {
  // Handle when user defines via CJS export: "module.exports = myFunction;"
  userProvidedDefaultHandler = userApiModule;
}

// Wrap the handler that the user provided (middleware, proxy, or default)
// We preserve the original export names so Next.js can handle its internal renaming logic
const wrappedHandler = userProvidedNamedHandler ? Sentry.wrapMiddlewareWithSentry(userProvidedNamedHandler) : undefined;

// Only export the named export that the user actually provided
// This ensures Next.js sees the same export structure and can apply its renaming logic
export const middleware = userProvidedMiddleware ? wrappedHandler : undefined;
export const proxy = userProvidedProxy ? wrappedHandler : undefined;
export default userProvidedDefaultHandler ? Sentry.wrapMiddlewareWithSentry(userProvidedDefaultHandler) : undefined;

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';
