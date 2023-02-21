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
// @ts-ignore TODO
// eslint-disable-next-line import/no-unresolved
import { headers } from 'next/headers';

type ServerComponentModule = {
  default: unknown;
};

const serverComponentModule = wrapee as ServerComponentModule;

const serverComponent = serverComponentModule.default;

let wrappedServerComponent;
if (typeof serverComponent === 'function') {
  wrappedServerComponent = new Proxy(serverComponent, {
    apply: (originalServerComponent, thisArg, args) => {
      const headersList = headers();

      return Sentry.wrapServerComponentWithSentry(originalServerComponent, {
        componentRoute: '__ROUTE__',
        componentType: '__COMPONENT_TYPE__',
        sentryTraceHeader: headersList.get('sentry-trace'),
        baggageHeader: headersList.get('baggage'),
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
