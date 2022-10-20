/**
 * This file is a template for the code which will be substituted when our webpack loader handles non-API files in the
 * `pages/` directory.
 *
 * We use `__RESOURCE_PATH__` as a placeholder for the path to the file being wrapped. Because it's not a real package,
 * this causes both TS and ESLint to complain, hence the pragma comments below.
 *
 * The `?__sentry_external__` is used to
 * 1) tell rollup to treat the import as external (i.e. not process it)
 * 2) tell webpack not to proxy this file again (avoiding an infinite loop)
 */

// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
import * as wrapee from '__RESOURCE_PATH__?__sentry_external__';
import * as Sentry from '@sentry/nextjs';
import type { GetServerSideProps, GetStaticProps, NextPage as NextPageComponent } from 'next';

type NextPageModule = {
  default: { getInitialProps?: NextPageComponent['getInitialProps'] };
  getStaticProps?: GetStaticProps;
  getServerSideProps?: GetServerSideProps;
};

const userPageModule = wrapee as NextPageModule;

const pageComponent = userPageModule.default;

const origGetInitialProps = pageComponent.getInitialProps;
const origGetStaticProps = userPageModule.getStaticProps;
const origGetServerSideProps = userPageModule.getServerSideProps;

const getInitialPropsWrappers: Record<string, any> = {
  '/_app': Sentry.withSentryServerSideAppGetInitialProps,
  '/_document': Sentry.withSentryServerSideDocumentGetInitialProps,
  '/_error': Sentry.withSentryServerSideErrorGetInitialProps,
};

const getInitialPropsWrapper = getInitialPropsWrappers['__ROUTE__'] || Sentry.withSentryServerSideGetInitialProps;

if (typeof origGetInitialProps === 'function') {
  pageComponent.getInitialProps = getInitialPropsWrapper(origGetInitialProps) as NextPageComponent['getInitialProps'];
}

export const getStaticProps =
  typeof origGetStaticProps === 'function'
    ? Sentry.withSentryGetStaticProps(origGetStaticProps, '__ROUTE__')
    : undefined;
export const getServerSideProps =
  typeof origGetServerSideProps === 'function'
    ? Sentry.withSentryGetServerSideProps(origGetServerSideProps, '__ROUTE__')
    : undefined;

export default pageComponent;

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
export * from '__RESOURCE_PATH__';
