import { getCurrentHub } from '@sentry/core';
import { WINDOW } from '@sentry/react';
import type { Primitive, TraceparentData, Transaction, TransactionContext, TransactionSource } from '@sentry/types';
import {
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
  logger,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import type { NEXT_DATA as NextData } from 'next/dist/next-server/lib/utils';
import { default as Router } from 'next/router';
import type { ParsedUrlQuery } from 'querystring';

const globalObject = WINDOW as typeof WINDOW & {
  __BUILD_MANIFEST?: {
    sortedPages?: string[];
  };
};

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

/**
 * Describes data located in the __NEXT_DATA__ script tag. This tag is present on every page of a Next.js app.
 */
interface SentryEnhancedNextData extends NextData {
  props: {
    pageProps?: {
      _sentryTraceData?: string; // trace parent info, if injected by a data-fetcher
      _sentryBaggage?: string; // baggage, if injected by a data-fetcher
      // These two values are only injected by `getStaticProps` in a very special case with the following conditions:
      // 1. The page's `getStaticPaths` method must have returned `fallback: 'blocking'`.
      // 2. The requested page must be a "miss" in terms of "Incremental Static Regeneration", meaning the requested page has not been generated before.
      // In this case, a page is requested and only served when `getStaticProps` is done. There is not even a fallback page or similar.
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
  const nextDataTag = globalObject.document.getElementById('__NEXT_DATA__');
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

  // `nextData.page` always contains the parameterized route - except for when an error occurs in a data fetching
  // function, then it is "/_error", but that isn't a problem since users know which route threw by looking at the
  // parent transaction
  // TODO: Actually this is a problem (even though it is not that big), because the DSC and the transaction payload will contain
  // a different transaction name. Maybe we can fix this. Idea: Also send transaction name via pageProps when available.
  nextDataTagInfo.route = page;
  nextDataTagInfo.params = query;

  if (props && props.pageProps) {
    if (props.pageProps._sentryBaggage) {
      nextDataTagInfo.baggage = props.pageProps._sentryBaggage;
    }

    if (props.pageProps._sentryTraceData) {
      nextDataTagInfo.traceParentData = extractTraceparentData(props.pageProps._sentryTraceData);
    }
  }

  return nextDataTagInfo;
}

const DEFAULT_TAGS = {
  'routing.instrumentation': 'next-router',
} as const;

// We keep track of the active transaction so we can finish it when we start a navigation transaction.
let activeTransaction: Transaction | undefined = undefined;

// We keep track of the previous location name so we can set the `from` field on navigation transactions.
// This is either a route or a pathname.
let prevLocationName: string | undefined = undefined;

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
  const { route, traceParentData, baggage, params } = extractNextDataTagInformation();
  prevLocationName = route || globalObject.location.pathname;

  if (startTransactionOnPageLoad) {
    const source = route ? 'route' : 'url';
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggage);

    activeTransaction = startTransactionCb({
      name: prevLocationName,
      op: 'pageload',
      tags: DEFAULT_TAGS,
      ...(params && client && client.getOptions().sendDefaultPii && { data: params }),
      ...traceParentData,
      metadata: {
        source,
        dynamicSamplingContext: traceParentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
      },
    });
  }

  if (startTransactionOnLocationChange) {
    Router.events.on('routeChangeStart', (navigationTarget: string) => {
      const matchedRoute = getNextRouteFromPathname(stripUrlQueryAndFragment(navigationTarget));

      let transactionName: string;
      let transactionSource: TransactionSource;

      if (matchedRoute) {
        transactionName = matchedRoute;
        transactionSource = 'route';
      } else {
        transactionName = navigationTarget;
        transactionSource = 'url';
      }

      const tags: Record<string, Primitive> = {
        ...DEFAULT_TAGS,
        from: prevLocationName,
      };

      prevLocationName = transactionName;

      if (activeTransaction) {
        activeTransaction.finish();
      }

      const navigationTransaction = startTransactionCb({
        name: transactionName,
        op: 'navigation',
        tags,
        metadata: { source: transactionSource },
      });

      if (navigationTransaction) {
        // In addition to the navigation transaction we're also starting a span to mark Next.js's `routeChangeStart`
        // and `routeChangeComplete` events.
        // We don't want to finish the navigation transaction on `routeChangeComplete`, since users might want to attach
        // spans to that transaction even after `routeChangeComplete` is fired (eg. HTTP requests in some useEffect
        // hooks). Instead, we'll simply let the navigation transaction finish itself (it's an `IdleTransaction`).
        const nextRouteChangeSpan = navigationTransaction.startChild({
          op: 'ui.nextjs.route-change',
          description: 'Next.js Route Change',
        });

        const finishRouteChangeSpan = (): void => {
          nextRouteChangeSpan.finish();
          Router.events.off('routeChangeComplete', finishRouteChangeSpan);
        };

        Router.events.on('routeChangeComplete', finishRouteChangeSpan);
      }
    });
  }
}

function getNextRouteFromPathname(pathname: string): string | undefined {
  const pageRoutes = (globalObject.__BUILD_MANIFEST || {}).sortedPages;

  // Page route should in 99.999% of the cases be defined by now but just to be sure we make a check here
  if (!pageRoutes) {
    return;
  }

  return pageRoutes.find(route => {
    const routeRegExp = convertNextRouteToRegExp(route);
    return pathname.match(routeRegExp);
  });
}

/**
 * Converts a Next.js style route to a regular expression that matches on pathnames (no query params or URL fragments).
 *
 * In general this involves replacing any instances of square brackets in a route with a wildcard:
 * e.g. "/users/[id]/info" becomes /\/users\/([^/]+?)\/info/
 *
 * Some additional edgecases need to be considered:
 * - All routes have an optional slash at the end, meaning users can navigate to "/users/[id]/info" or
 *   "/users/[id]/info/" - both will be resolved to "/users/[id]/info".
 * - Non-optional "catchall"s at the end of a route must be considered when matching (e.g. "/users/[...params]").
 * - Optional "catchall"s at the end of a route must be considered when matching (e.g. "/users/[[...params]]").
 *
 * @param route A Next.js style route as it is found in `global.__BUILD_MANIFEST.sortedPages`
 */
function convertNextRouteToRegExp(route: string): RegExp {
  // We can assume a route is at least "/".
  const routeParts = route.split('/');

  let optionalCatchallWildcardRegex = '';
  if (routeParts[routeParts.length - 1].match(/^\[\[\.\.\..+\]\]$/)) {
    // If last route part has pattern "[[...xyz]]" we pop the latest route part to get rid of the required trailing
    // slash that would come before it if we didn't pop it.
    routeParts.pop();
    optionalCatchallWildcardRegex = '(?:/(.+?))?';
  }

  const rejoinedRouteParts = routeParts
    .map(
      routePart =>
        routePart
          .replace(/^\[\.\.\..+\]$/, '(.+?)') // Replace catch all wildcard with regex wildcard
          .replace(/^\[.*\]$/, '([^/]+?)'), // Replace route wildcards with lazy regex wildcards
    )
    .join('/');

  return new RegExp(
    `^${rejoinedRouteParts}${optionalCatchallWildcardRegex}(?:/)?$`, // optional slash at the end
  );
}
