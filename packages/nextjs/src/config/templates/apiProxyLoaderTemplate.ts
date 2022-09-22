/**
 * This file is a template for the code which will be substituted when our webpack loader handles API files in the
 * `pages/` directory.
 *
 * We use `__RESOURCE_PATH__` as a placeholder for the path to the file being wrapped. Because it's not a real package,
 * this causes both TS and ESLint to complain, hence the pragma comments below.
 */

// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
import * as origModule from '__RESOURCE_PATH__';
import * as Sentry from '@sentry/nextjs';
import type { PageConfig } from 'next';

// We import this from `wrappers` rather than directly from `next` because our version can work simultaneously with
// multiple versions of next. See note in `wrappers/withSentry` for more.
import type { NextApiHandler } from '../wrappers';

type NextApiModule = {
  default: NextApiHandler;
  config?: PageConfig;
};

const userApiModule = origModule as NextApiModule;

const maybeWrappedHandler = userApiModule.default;
const origConfig = userApiModule.config || {};

// Setting `externalResolver` to `true` prevents nextjs from throwing a warning in dev about API routes resolving
// without sending a response. It's a false positive (a response is sent, but only after we flush our send queue), and
// we throw a warning of our own to tell folks that, but it's better if we just don't have to deal with it in the first
// place.
export const config = {
  ...origConfig,
  api: {
    ...origConfig.api,
    externalResolver: true,
  },
};

export default Sentry.withSentryAPI(maybeWrappedHandler, '__ROUTE__');

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
export * from '__RESOURCE_PATH__';
