/*
 * This file is a template for the code which will be substituted when our webpack loader handles non-API files in the
 * `pages/` directory.
 *
 * We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped. Because it's not a real package,
 * this causes both TS and ESLint to complain, hence the pragma comments below.
 */

import * as Sentry from '@sentry/nextjs';
// @ts-expect-error See above
import * as wrapee from '__SENTRY_WRAPPING_TARGET_FILE__';
import type { GetServerSideProps, GetStaticProps, NextPage as NextPageComponent } from 'next';

type NextPageModule = {
  default?: { getInitialProps?: NextPageComponent['getInitialProps'] };
  getStaticProps?: GetStaticProps;
  getServerSideProps?: GetServerSideProps;
};

const userPageModule = wrapee as NextPageModule;

const pageComponent = userPageModule ? userPageModule.default : undefined;

const origGetInitialProps = pageComponent ? pageComponent.getInitialProps : undefined;
const origGetStaticProps = userPageModule ? userPageModule.getStaticProps : undefined;
const origGetServerSideProps = userPageModule ? userPageModule.getServerSideProps : undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getInitialPropsWrappers: Record<string, any> = {
  '/_app': Sentry.wrapAppGetInitialPropsWithSentry,
  '/_document': Sentry.wrapDocumentGetInitialPropsWithSentry,
  '/_error': Sentry.wrapErrorGetInitialPropsWithSentry,
};

const getInitialPropsWrapper = getInitialPropsWrappers['__ROUTE__'] || Sentry.wrapGetInitialPropsWithSentry;

if (pageComponent && typeof origGetInitialProps === 'function') {
  pageComponent.getInitialProps = getInitialPropsWrapper(origGetInitialProps) as NextPageComponent['getInitialProps'];
}

export const getStaticProps =
  typeof origGetStaticProps === 'function'
    ? Sentry.wrapGetStaticPropsWithSentry(origGetStaticProps, '__ROUTE__')
    : undefined;
export const getServerSideProps =
  typeof origGetServerSideProps === 'function'
    ? Sentry.wrapGetServerSidePropsWithSentry(origGetServerSideProps, '__ROUTE__')
    : undefined;

export default pageComponent ? Sentry.wrapPageComponentWithSentry(pageComponent as unknown) : pageComponent;

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matches something we've explicitly exported above.
// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';
