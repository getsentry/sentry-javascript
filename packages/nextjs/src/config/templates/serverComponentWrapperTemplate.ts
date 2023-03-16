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
  default: unknown;
};

const serverComponentModule = wrapee as ServerComponentModule;

const serverComponent = serverComponentModule.default;

let wrappedServerComponent;
if (typeof serverComponent === 'function') {
  // For some odd Next.js magic reason, `headers()` will not work if used inside `wrapServerComponentsWithSentry`.
  // Current assumption is that Next.js applies some loader magic to userfiles, but not files in node_modules. This file
  // is technically a userfile so it gets the loader magic applied.
  wrappedServerComponent = new Proxy(serverComponent, {
    apply: (originalFunction, thisArg, args) => {
      let sentryTraceHeader: string | undefined = undefined;
      let baggageHeader: string | undefined = undefined;

      // If we call the headers function inside the build phase, Next.js will automatically mark the server component as
      // dynamic(SSR) which we do not want in case the users have a static component.
      if (process.env.NEXT_PHASE !== 'phase-production-build') {
        // try/catch because calling headers() when a previously statically generated page is being revalidated causes a
        // runtime error in next.js as switching a page from static to dynamic during runtime is not allowed
        try {
          const headersList = headers();
          sentryTraceHeader = headersList.get('sentry-trace');
          baggageHeader = headersList.get('baggage');
        } catch {
          /** empty */
        }
      }

      return Sentry.wrapServerComponentWithSentry(originalFunction, {
        componentRoute: '__ROUTE__',
        componentType: '__COMPONENT_TYPE__',
        sentryTraceHeader,
        baggageHeader,
      }).apply(thisArg, args);
    },
  });
} else {
  wrappedServerComponent = serverComponent;
}

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

export default wrappedServerComponent;
