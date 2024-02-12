import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { WINDOW } from '@sentry/react';
import type { StartSpanOptions } from '@sentry/types';
import { addFetchInstrumentationHandler, browserPerformanceTimeOrigin } from '@sentry/utils';

type StartSpanCb = (context: StartSpanOptions) => void;

const DEFAULT_TAGS = {
  'routing.instrumentation': 'next-app-router',
} as const;

/**
 * Instruments the Next.js Client App Router.
 */
export function appRouterInstrumentation(
  shouldInstrumentPageload: boolean,
  shouldInstrumentNavigation: boolean,
  startPageloadSpanCallback: StartSpanCb,
  startNavigationSpanCallback: StartSpanCb,
): void {
  // We keep track of the previous location name so we can set the `from` field on navigation transactions.
  // This is either a route or a pathname.
  let currPathname = WINDOW.location.pathname;

  if (shouldInstrumentPageload) {
    startPageloadSpanCallback({
      name: currPathname,
      tags: DEFAULT_TAGS,
      // pageload should always start at timeOrigin (and needs to be in s, not ms)
      startTime: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.nextjs.app_router_instrumentation',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
    });
  }

  if (shouldInstrumentNavigation) {
    addFetchInstrumentationHandler(handlerData => {
      // The instrumentation handler is invoked twice - once for starting a request and once when the req finishes
      // We can use the existence of the end-timestamp to filter out "finishing"-events.
      if (handlerData.endTimestamp !== undefined) {
        return;
      }

      // Only GET requests can be navigating RSC requests
      if (handlerData.fetchData.method !== 'GET') {
        return;
      }

      const parsedNavigatingRscFetchArgs = parseNavigatingRscFetchArgs(handlerData.args);

      if (parsedNavigatingRscFetchArgs === null) {
        return;
      }

      const newPathname = parsedNavigatingRscFetchArgs.targetPathname;
      currPathname = newPathname;

      startNavigationSpanCallback({
        name: newPathname,
        tags: {
          ...DEFAULT_TAGS,
          from: currPathname,
        },
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      });
    });
  }
}

function parseNavigatingRscFetchArgs(fetchArgs: unknown[]): null | {
  targetPathname: string;
} {
  // Make sure the first arg is a URL object
  if (!fetchArgs[0] || typeof fetchArgs[0] !== 'object' || (fetchArgs[0] as URL).searchParams === undefined) {
    return null;
  }

  // Make sure the second argument is some kind of fetch config obj that contains headers
  if (!fetchArgs[1] || typeof fetchArgs[1] !== 'object' || !('headers' in fetchArgs[1])) {
    return null;
  }

  try {
    const url = fetchArgs[0] as URL;
    const headers = fetchArgs[1].headers as Record<string, string>;

    // Not an RSC request
    if (headers['RSC'] !== '1') {
      return null;
    }

    // Prefetch requests are not navigating RSC requests
    if (headers['Next-Router-Prefetch'] === '1') {
      return null;
    }

    return {
      targetPathname: url.pathname,
    };
  } catch {
    return null;
  }
}
