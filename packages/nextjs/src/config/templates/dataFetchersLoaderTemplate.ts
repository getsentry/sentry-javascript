import type { GetServerSideProps as GetServerSidePropsFunction, GetStaticProps as GetStaticPropsFunction } from 'next';

declare const __ORIG_GSSP__: GetServerSidePropsFunction;
declare const __ORIG_GSPROPS__: GetStaticPropsFunction;

// We import the SDK under a purposefully clunky name, to lessen to near zero the chances of a name collision in case
// the user has also imported Sentry for some reason. (In the future, we could check for such a collision using the AST,
// but this is a lot simpler.)
//
// TODO: This import line is here because it needs to be in the injected code, but it also would (ideally)
// let us take advantage of typechecking, via the linter (both eslint and the TS linter), using intellisense, and when
// building. Solving for all five simultaneously seems to be tricky, however, because of the circular dependency. This
// is one of a number of possible compromise options, which seems to hit everything except eslint linting and
// typechecking via `tsc`. (TS linting and intellisense both work, though, so we do get at least some type safety.) See
// https://github.com/getsentry/sentry-javascript/pull/5503#discussion_r936827996 for more details.
//
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved
import * as ServerSideSentryNextjsSDK from '@sentry/nextjs';

const PARAMETERIZED_ROUTE = '__FILEPATH__';

export const getServerSideProps =
  typeof __ORIG_GSSP__ === 'function'
    ? ServerSideSentryNextjsSDK.withSentryGetServerSideProps(__ORIG_GSSP__)
    : __ORIG_GSSP__;
export const getStaticProps =
  typeof __ORIG_GSPROPS__ === 'function'
    ? ServerSideSentryNextjsSDK.withSentryGetStaticProps(__ORIG_GSPROPS__)
    : __ORIG_GSPROPS__;
