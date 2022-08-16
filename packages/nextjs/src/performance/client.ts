/* eslint-disable @typescript-eslint/no-explicit-any */

import { getCurrentHub } from '@sentry/hub';
import { Primitive, TraceparentData, Transaction, TransactionContext } from '@sentry/types';
import {
  extractTraceparentData,
  fill,
  getGlobalObject,
  logger,
  parseBaggageHeader,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import type { NEXT_DATA as NextData } from 'next/dist/next-server/lib/utils';
import { default as Router } from 'next/router';
import type { ParsedUrlQuery } from 'querystring';

const global = getGlobalObject<Window>();

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

/**
 * Describes data located in the __NEXT_DATA__ script tag. This tag is present on every page of a Next.js app.
 */
interface SentryEnhancedNextData extends NextData {
  // contains props returned by `getInitialProps` - except for `pageProps`, these are the props that got returned by `getServerSideProps` or `getStaticProps`
  props: {
    _sentryGetInitialPropsTraceData?: string; // trace parent info, if injected by server-side `getInitialProps`
    _sentryGetInitialPropsBaggage?: string; // baggage, if injected by server-side `getInitialProps`
    pageProps?: {
      _sentryGetServerSidePropsTraceData?: string; // trace parent info, if injected by server-side `getServerSideProps`
      _sentryGetServerSidePropsBaggage?: string; // baggage, if injected by server-side `getServerSideProps`

      // The following two values are only injected in a very special case with the following conditions:
      // 1. The page's `getStaticPaths` method must have returned `fallback: 'blocking'`.
      // 2. The requested page must be a "miss" in terms of "Incremental Static Regeneration", meaning the requested page has not been generated before.
      // In this case, a page is requested and only served when `getStaticProps` is done. There is not even a fallback page or similar.
      _sentryGetStaticPropsTraceData?: string; // trace parent info, if injected by server-side `getStaticProps`
      _sentryGetStaticPropsBaggage?: string; // baggage, if injected by server-side `getStaticProps`
    };
  };
}

interface NextDataTagInfo {
  route?: string;
  traceParentData?: TraceparentData;
  baggage?: string;
  params?: ParsedUrlQuery;
}

/**
 * Every Next.js page (static and dynamic ones) comes with a script tag with the id "__NEXT_DATA__". This script tag
 * contains a JSON object with data that was either generated at build time for static pages (`getStaticProps`), or at
 * runtime with data fetchers like `getServerSideProps.`.
 *
 * We can use this information to:
 * - Always get the parameterized route we're in when loading a page.
 * - Send trace information (trace-id, baggage) from the server to the client.
 *
 * This function extracts this information.
 */
function extractNextDataTagInformation(): NextDataTagInfo {
  let nextData: SentryEnhancedNextData | undefined;
  // Let's be on the safe side and actually check first if there is really a __NEXT_DATA__ script tag on the page.
  // Theoretically this should always be the case though.
  const nextDataTag = global.document.getElementById('__NEXT_DATA__');
  if (nextDataTag && nextDataTag.innerHTML) {
    try {
      nextData = JSON.parse(nextDataTag.innerHTML);
    } catch (e) {
      __DEBUG_BUILD__ && logger.warn('Could not extract __NEXT_DATA__');
    }
  }

  if (!nextData) {
    return {};
  }

  const nextDataTagInfo: NextDataTagInfo = {};

  const { page, query, props } = nextData;

  // `nextData.page` always contains the parameterized route
  nextDataTagInfo.route = page;
  nextDataTagInfo.params = query;

  if (props) {
    const { pageProps } = props;

    const getInitialPropsBaggage = props._sentryGetInitialPropsBaggage;
    const getServerSidePropsBaggage = pageProps && pageProps._sentryGetServerSidePropsBaggage;
    const getStaticPropsBaggage = pageProps && pageProps._sentryGetStaticPropsBaggage;
    // Ordering of the following shouldn't matter but `getInitialProps` generally runs before `getServerSideProps` or `getStaticProps` so we give it priority.
    const baggage = getInitialPropsBaggage || getServerSidePropsBaggage || getStaticPropsBaggage;
    if (baggage) {
      nextDataTagInfo.baggage = baggage;
    }

    const getInitialPropsTraceData = props._sentryGetInitialPropsTraceData;
    const getServerSidePropsTraceData = pageProps && pageProps._sentryGetServerSidePropsTraceData;
    const getStaticPropsTraceData = pageProps && pageProps._sentryGetStaticPropsTraceData;
    // Ordering of the following shouldn't matter but `getInitialProps` generally runs before `getServerSideProps` or `getStaticProps` so we give it priority.
    const traceData = getInitialPropsTraceData || getServerSidePropsTraceData || getStaticPropsTraceData;
    if (traceData) {
      nextDataTagInfo.traceParentData = extractTraceparentData(traceData);
    }
  }

  return nextDataTagInfo;
}

const DEFAULT_TAGS = {
  'routing.instrumentation': 'next-router',
} as const;

let activeTransaction: Transaction | undefined = undefined;
let prevTransactionName: string | undefined = undefined;
let startTransaction: StartTransactionCb | undefined = undefined;

const client = getCurrentHub().getClient();

/**
 * Creates routing instrumention for Next Router. Only supported for
 * client side routing. Works for Next >= 10.
 *
 * Leverages the SingletonRouter from the `next/router` to
 * generate pageload/navigation transactions and parameterize
 * transaction names.
 */
export function nextRouterInstrumentation(
  startTransactionCb: StartTransactionCb,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  startTransaction = startTransactionCb;

  if (startTransactionOnPageLoad) {
    const { route, traceParentData, baggage, params } = extractNextDataTagInformation();

    prevTransactionName = route || global.location.pathname;
    const source = route ? 'route' : 'url';

    activeTransaction = startTransactionCb({
      name: prevTransactionName,
      op: 'pageload',
      tags: DEFAULT_TAGS,
      ...(params && client && client.getOptions().sendDefaultPii && { data: params }),
      ...traceParentData,
      metadata: {
        source,
        ...(baggage && { baggage: parseBaggageHeader(baggage) }),
      },
    });
  }

  Router.ready(() => {
    // Spans that aren't attached to any transaction are lost; so if transactions aren't
    // created (besides potentially the onpageload transaction), no need to wrap the router.
    if (!startTransactionOnLocationChange) return;

    // `withRouter` uses `useRouter` underneath:
    // https://github.com/vercel/next.js/blob/de42719619ae69fbd88e445100f15701f6e1e100/packages/next/client/with-router.tsx#L21
    // Router events also use the router:
    // https://github.com/vercel/next.js/blob/de42719619ae69fbd88e445100f15701f6e1e100/packages/next/client/router.ts#L92
    // `Router.changeState` handles the router state changes, so it may be enough to only wrap it
    // (instead of wrapping all of the Router's functions).
    const routerPrototype = Object.getPrototypeOf(Router.router);
    fill(routerPrototype, 'changeState', changeStateWrapper);
  });
}

type RouterChangeState = (
  method: string,
  url: string,
  as: string,
  options: Record<string, any>,
  ...args: any[]
) => void;
type WrappedRouterChangeState = RouterChangeState;

/**
 * Wraps Router.changeState()
 * https://github.com/vercel/next.js/blob/da97a18dafc7799e63aa7985adc95f213c2bf5f3/packages/next/next-server/lib/router/router.ts#L1204
 * Start a navigation transaction every time the router changes state.
 */
function changeStateWrapper(originalChangeStateWrapper: RouterChangeState): WrappedRouterChangeState {
  return function wrapper(
    this: any,
    method: string,
    // The parameterized url, ex. posts/[id]/[comment]
    url: string,
    // The actual url, ex. posts/85/my-comment
    as: string,
    options: Record<string, any>,
    // At the moment there are no additional arguments (meaning the rest parameter is empty).
    // This is meant to protect from future additions to Next.js API, especially since this is an
    // internal API.
    ...args: any[]
  ): Promise<boolean> {
    const newTransactionName = stripUrlQueryAndFragment(url);
    // do not start a transaction if it's from the same page
    if (startTransaction !== undefined && prevTransactionName !== newTransactionName) {
      if (activeTransaction) {
        activeTransaction.finish();
      }
      const tags: Record<string, Primitive> = {
        ...DEFAULT_TAGS,
        method,
        ...options,
      };
      if (prevTransactionName) {
        tags.from = prevTransactionName;
      }
      prevTransactionName = newTransactionName;
      activeTransaction = startTransaction({
        name: prevTransactionName,
        op: 'navigation',
        tags,
        metadata: { source: 'route' },
      });
    }
    return originalChangeStateWrapper.call(this, method, url, as, options, ...args);
  };
}
