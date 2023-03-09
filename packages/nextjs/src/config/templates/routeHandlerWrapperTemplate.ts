/*
 * This file is a template for the code which will be substituted when our webpack loader handles non-API files in the
 * `pages/` directory.
 *
 * We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped. Because it's not a real package,
 * this causes both TS and ESLint to complain, hence the pragma comments below.
 */

// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
import * as wrapee from '__SENTRY_WRAPPING_TARGET_FILE__';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as Sentry from '@sentry/nextjs';
// @ts-ignore This template is only used with the app directory so we know that this dependency exists.
// eslint-disable-next-line import/no-unresolved
import { headers } from 'next/headers';

declare function headers(): { get: (header: string) => string | undefined };

type ServerComponentModule = {
  GET?: (...args: unknown[]) => unknown;
  POST?: (...args: unknown[]) => unknown;
  PUT?: (...args: unknown[]) => unknown;
  PATCH?: (...args: unknown[]) => unknown;
  DELETE?: (...args: unknown[]) => unknown;
  HEAD?: (...args: unknown[]) => unknown;
  OPTIONS?: (...args: unknown[]) => unknown;
};

const serverComponentModule = wrapee as ServerComponentModule;

function wrapHandler<T>(handler: T, method: string): T {
  // Running the instrumentation code during the build phase will mark any function as "dynamic" because we're accessing
  // the Request object. We do not want to turn handlers dynamic so we skip instrumentation in the build phase.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return handler;
  }

  if (typeof handler !== 'function') {
    return handler;
  }

  return new Proxy(handler, {
    apply: (originalFunction, thisArg, args) => {
      const headersList = headers();
      const sentryTraceHeader = headersList.get('sentry-trace');
      const baggageHeader = headersList.get('baggage');

      return Sentry.wrapRouteHandlerWithSentry(originalFunction, {
        method,
        parameterizedRoute: '__ROUTE__',
        sentryTraceHeader,
        baggageHeader,
      }).apply(thisArg, args);
    },
  });
}

export const GET = wrapHandler(serverComponentModule.GET, 'GET');
export const POST = wrapHandler(serverComponentModule.POST, 'POST');
export const PUT = wrapHandler(serverComponentModule.PUT, 'PUT');
export const PATCH = wrapHandler(serverComponentModule.PATCH, 'PATCH');
export const DELETE = wrapHandler(serverComponentModule.DELETE, 'DELETE');
export const HEAD = wrapHandler(serverComponentModule.HEAD, 'HEAD');
export const OPTIONS = wrapHandler(serverComponentModule.OPTIONS, 'OPTIONS');

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
export * from '__SENTRY_WRAPPING_TARGET_FILE__';
