import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { GLOBAL_OBJ, browserPerformanceTimeOrigin } from '@sentry/core';
import type { Client, Span } from '@sentry/core';
import { WINDOW, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '@sentry/react';

export const INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME = 'incomplete-app-router-transaction';

/** Instruments the Next.js app router for pageloads. */
export function appRouterInstrumentPageLoad(client: Client): void {
  const origin = browserPerformanceTimeOrigin();
  startBrowserTracingPageLoadSpan(client, {
    name: WINDOW.location.pathname,
    // pageload should always start at timeOrigin (and needs to be in s, not ms)
    startTime: origin ? origin / 1000 : undefined,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.nextjs.app_router_instrumentation',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });
}

interface NavigationSpanRef {
  current: Span | undefined;
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
  const currentNavigationSpanRef: NavigationSpanRef = { current: undefined };

  WINDOW.addEventListener('popstate', () => {
    if (currentNavigationSpanRef.current?.isRecording()) {
      currentNavigationSpanRef.current.updateName(WINDOW.location.pathname);
      currentNavigationSpanRef.current.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'url');
    } else {
      currentNavigationSpanRef.current = startBrowserTracingNavigationSpan(client, {
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

      patchRouter(client, router, currentNavigationSpanRef);

      // If the router at any point gets overridden - patch again
      (['nd', 'next'] as const).forEach(globalValueName => {
        const globalValue = GLOBAL_OBJ_WITH_NEXT_ROUTER[globalValueName];
        if (globalValue) {
          GLOBAL_OBJ_WITH_NEXT_ROUTER[globalValueName] = new Proxy(globalValue, {
            set(target, p, newValue) {
              if (p === 'router' && typeof newValue === 'object' && newValue !== null) {
                patchRouter(client, newValue, currentNavigationSpanRef);
              }

              // @ts-expect-error we cannot possibly type this
              target[p] = newValue;
              return true;
            },
          });
        }
      });
    }
  }, ROUTER_AVAILABILITY_CHECK_INTERVAL_MS);
}

function transactionNameifyRouterArgument(target: string): string {
  try {
    // We provide an arbitrary base because we only care about the pathname and it makes URL parsing more resilient.
    return new URL(target, 'http://example.com/').pathname;
  } catch {
    return '/';
  }
}

const patchedRouters = new WeakSet<NextRouter>();

function patchRouter(client: Client, router: NextRouter, currentNavigationSpanRef: NavigationSpanRef): void {
  if (patchedRouters.has(router)) {
    return;
  }
  patchedRouters.add(router);

  (['back', 'forward', 'push', 'replace'] as const).forEach(routerFunctionName => {
    if (router?.[routerFunctionName]) {
      // @ts-expect-error Weird type error related to not knowing how to associate return values with the individual functions - we can just ignore
      router[routerFunctionName] = new Proxy(router[routerFunctionName], {
        apply(target, thisArg, argArray) {
          let transactionName = INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME;
          const transactionAttributes: Record<string, string> = {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          };

          if (routerFunctionName === 'push') {
            transactionName = transactionNameifyRouterArgument(argArray[0]);
            transactionAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'url';
            transactionAttributes['navigation.type'] = 'router.push';
          } else if (routerFunctionName === 'replace') {
            transactionName = transactionNameifyRouterArgument(argArray[0]);
            transactionAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'url';
            transactionAttributes['navigation.type'] = 'router.replace';
          } else if (routerFunctionName === 'back') {
            transactionAttributes['navigation.type'] = 'router.back';
          } else if (routerFunctionName === 'forward') {
            transactionAttributes['navigation.type'] = 'router.forward';
          }

          currentNavigationSpanRef.current = startBrowserTracingNavigationSpan(client, {
            name: transactionName,
            attributes: transactionAttributes,
          });

          return target.apply(thisArg, argArray);
        },
      });
    }
  });
}
