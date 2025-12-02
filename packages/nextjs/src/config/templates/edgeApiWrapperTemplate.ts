/*
 * This file is a template for the code which will be substituted when our webpack loader handles edge API files in the
 * `pages/api/` directory.
 *
 * We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped. Because it's not a real package,
 * this causes both TS and ESLint to complain, hence the pragma comments below.
 */

// @ts-expect-error See above
import * as origModule from '__SENTRY_WRAPPING_TARGET_FILE__';
import * as Sentry from '@sentry/nextjs';
import type { PageConfig } from 'next';
import type { EdgeRouteHandler } from '../../edge/types';

type NextApiModule = (
  | {
      // ESM export
      default?: EdgeRouteHandler;
    }
  // CJS export
  | EdgeRouteHandler
) & { config?: PageConfig };

const userApiModule = origModule as NextApiModule;

// Default to undefined. It's possible for Next.js users to not define any exports/handlers in an API route. If that is
// the case Next.js will crash during runtime but the Sentry SDK should definitely not crash so we need to handle it.
let userProvidedHandler = undefined;

if ('default' in userApiModule && typeof userApiModule.default === 'function') {
  // Handle when user defines via ESM export: `export default myFunction;`
  userProvidedHandler = userApiModule.default;
} else if (typeof userApiModule === 'function') {
  // Handle when user defines via CJS export: "module.exports = myFunction;"
  userProvidedHandler = userApiModule;
}

const origConfig = userApiModule.config || {};

// Re-export the config as-is (edge routes don't need externalResolver)
export const config = origConfig;

let wrappedHandler = userProvidedHandler;

if (wrappedHandler) {
  wrappedHandler = Sentry.wrapApiHandlerWithSentry(wrappedHandler, '__ROUTE__');
}

export default wrappedHandler;

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matches something we've explicitly exported above.
// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

