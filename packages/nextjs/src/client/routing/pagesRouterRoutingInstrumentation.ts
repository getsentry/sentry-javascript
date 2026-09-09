import type { Client } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  parseBaggageHeader,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { startBrowserTracingPageLoadSpan, WINDOW } from '@sentry/react';
import type { NEXT_DATA } from 'next/dist/shared/lib/utils';
import type { ParsedUrlQuery } from 'querystring';
import { DEBUG_BUILD } from '../../common/debug-build';
import { URL_TEMPLATE } from '@sentry/conventions/attributes';

const globalObject = WINDOW;

/**
 * Describes data located in the __NEXT_DATA__ script tag. This tag is present on every page of a Next.js app.
 */
interface SentryEnhancedNextData extends NEXT_DATA {
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
  params?: ParsedUrlQuery;
  sentryTrace?: string;
  baggage?: string;
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
  if (nextDataTag?.innerHTML) {
    try {
      nextData = JSON.parse(nextDataTag.innerHTML);
    } catch {
      DEBUG_BUILD && debug.warn('Could not extract __NEXT_DATA__');
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

  if (props?.pageProps) {
    nextDataTagInfo.sentryTrace = props.pageProps._sentryTraceData;
    nextDataTagInfo.baggage = props.pageProps._sentryBaggage;
  }

  return nextDataTagInfo;
}

/**
 * Instruments the Next.js pages router for pageloads.
 * Only supported for client side routing. Works for Next >= 10.
 *
 * Leverages the SingletonRouter from the `next/router` to
 * generate pageload/navigation transactions and parameterize
 * transaction names.
 */
export function pagesRouterInstrumentPageLoad(client: Client): void {
  const { route, params, sentryTrace, baggage } = extractNextDataTagInformation();
  const parsedBaggage = parseBaggageHeader(baggage);
  let name = route || globalObject.location.pathname;

  // /_error is the fallback page for all errors. If there is a transaction name for /_error, use that instead
  if (parsedBaggage?.['sentry-transaction'] && name === '/_error') {
    name = parsedBaggage['sentry-transaction'];
    // Strip any HTTP method from the span name
    name = name.replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+/i, '');
  }

  const origin = browserPerformanceTimeOrigin();
  startBrowserTracingPageLoadSpan(
    client,
    {
      name,
      // pageload should always start at timeOrigin (and needs to be in s, not ms)
      startTime: origin ? origin / 1000 : undefined,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.nextjs.pages_router_instrumentation',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: route ? 'route' : 'url',
        ...(route && { [URL_TEMPLATE]: route }),
        ...(params && { ...params }),
      },
    },
    { sentryTrace, baggage },
  );
}
