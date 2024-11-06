import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { WINDOW, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '@sentry/react';
import type { Client, Span } from '@sentry/types';
import { GLOBAL_OBJ, browserPerformanceTimeOrigin } from '@sentry/utils';

export const INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME = 'incomplete-app-router-transaction';

/** Instruments the Next.js app router for pageloads. */
export function appRouterInstrumentPageLoad(client: Client): void {
  startBrowserTracingPageLoadSpan(client, {
    name: WINDOW.location.pathname,
    // pageload should always start at timeOrigin (and needs to be in s, not ms)
    startTime: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.nextjs.app_router_instrumentation',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });
}

interface NextRouter {
  back: () => void;
  forward: () => void;
  push: (target: string) => void;
  replace: (target: string) => void;
}

// Yes, yes, I know we shouldn't depend on these internals. But that's where we are at. We write the ugly code, so you don't have to.
const GLOBAL_OBJ_WITH_NEXT_ROUTER = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  // Available until 13.4.4-canary.3 - https://github.com/vercel/next.js/pull/50210
  nd?: {
    router?: NextRouter;
  };
  // Available from 13.4.4-canary.4 - https://github.com/vercel/next.js/pull/50210
  next?: {
    router?: NextRouter;
  };
};

/*
 * The routing instrumentation needs to handle a few cases:
 * - Router operations:
 *  - router.push() (either explicitly called or implicitly through <Link /> tags)
 *  - router.replace() (either explicitly called or implicitly through <Link replace /> tags)
 *  - router.back()
 *  - router.forward()
 * - Browser operations:
 *  - native Browser-back / popstate event (implicitly called by router.back())
 *  - native Browser-forward / popstate event (implicitly called by router.forward())
 */

/** Instruments the Next.js app router for navigation. */
export function appRouterInstrumentNavigation(client: Client): void {
  let currentNavigationSpan: Span | undefined = undefined;

  WINDOW.addEventListener('popstate', () => {
    if (currentNavigationSpan && currentNavigationSpan.isRecording()) {
      currentNavigationSpan.updateName(WINDOW.location.pathname);
    } else {
      currentNavigationSpan = startBrowserTracingNavigationSpan(client, {
        name: WINDOW.location.pathname,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          'navigation.type': 'browser.popstate',
        },
      });
    }
  });

  let routerPatched = false;
  let triesToFindRouter = 0;
  const MAX_TRIES_TO_FIND_ROUTER = 500;
  const ROUTER_AVAILABILITY_CHECK_INTERVAL_MS = 20;
  const checkForRouterAvailabilityInterval = setInterval(() => {
    triesToFindRouter++;
    const router = GLOBAL_OBJ_WITH_NEXT_ROUTER?.next?.router ?? GLOBAL_OBJ_WITH_NEXT_ROUTER?.nd?.router;

    if (routerPatched || triesToFindRouter > MAX_TRIES_TO_FIND_ROUTER) {
      clearInterval(checkForRouterAvailabilityInterval);
    } else if (router) {
      clearInterval(checkForRouterAvailabilityInterval);
      routerPatched = true;
      (['back', 'forward', 'push', 'replace'] as const).forEach(routerFunctionName => {
        if (router?.[routerFunctionName]) {
          // @ts-expect-error Weird type error related to not knowing how to associate return values with the individual functions - we can just ignore
          router[routerFunctionName] = new Proxy(router[routerFunctionName], {
            apply(target, thisArg, argArray) {
              const span = startBrowserTracingNavigationSpan(client, {
                name: INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                },
              });

              currentNavigationSpan = span;

              if (routerFunctionName === 'push') {
                span?.updateName(transactionNameifyRouterArgument(argArray[0]));
                span?.setAttribute('navigation.type', 'router.push');
              } else if (routerFunctionName === 'replace') {
                span?.updateName(transactionNameifyRouterArgument(argArray[0]));
                span?.setAttribute('navigation.type', 'router.replace');
              } else if (routerFunctionName === 'back') {
                span?.setAttribute('navigation.type', 'router.back');
              } else if (routerFunctionName === 'forward') {
                span?.setAttribute('navigation.type', 'router.forward');
              }

              return target.apply(thisArg, argArray);
            },
          });
        }
      });
    }
  }, ROUTER_AVAILABILITY_CHECK_INTERVAL_MS);
}

function transactionNameifyRouterArgument(target: string): string {
  try {
    return new URL(target, 'http://some-random-base.com/').pathname;
  } catch {
    return '/';
  }
}
