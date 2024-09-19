import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { WINDOW, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '@sentry/react';
import type { Client, Span } from '@sentry/types';
import { GLOBAL_OBJ, browserPerformanceTimeOrigin } from '@sentry/utils';

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

const GLOBAL_OBJ_WITH_NEXT_ROUTER = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  nd?: {
    router?: {
      back: () => void;
      forward: () => void;
      push: (target: string) => void;
      replace: (target: string) => void;
    };
  };
};

/**
 * The routing instrumentation needs to handle a few cases:
 * - Router operations:
 *  - router.push() (either explicitly called or implicitly through <Link /> tags)
 *  - router.replace() (either explicitly called or implicitly through <Link replace /> tags)
 *  - router.back()
 *  - router.forward()
 * - Browser operations:
 *  - native Browser-back
 *  - native Browser-forward
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
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation.popstate',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      });
    }
  });

  setTimeout(
    () => {
      (['back', 'forward', 'push', 'replace'] as const).forEach(routerFunctionName => {
        if (GLOBAL_OBJ_WITH_NEXT_ROUTER?.nd?.router?.[routerFunctionName]) {
          // @ts-expect-error TODO
          GLOBAL_OBJ_WITH_NEXT_ROUTER.nd.router[routerFunctionName] = new Proxy(
            GLOBAL_OBJ_WITH_NEXT_ROUTER.nd.router[routerFunctionName],
            {
              apply(target, thisArg, argArray) {
                let targetPathName: string;
                const opParts = ['navigation'];

                if (routerFunctionName === 'push') {
                  targetPathName = transactionNameifyRouterArgument(argArray[0]);
                } else if (routerFunctionName === 'replace') {
                  targetPathName = transactionNameifyRouterArgument(argArray[0]);
                } else if (routerFunctionName === 'back') {
                  targetPathName = 'TOOD'; // TODO - figure out how to filter txns with this name
                  opParts.push('router', 'back');
                } else if (routerFunctionName === 'forward') {
                  targetPathName = 'TOOD'; // TODO - figure out how to filter txns with this name
                  opParts.push('router', 'forward');
                }

                currentNavigationSpan = startBrowserTracingNavigationSpan(client, {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  name: targetPathName!,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: opParts.join('.'),
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  },
                });

                return target.apply(thisArg, argArray);
              },
            },
          );
        }
      });
    },
    // Some arbitrary amount of time that is enough for Next.js to populate `window.next.router`
    50,
  );
}

function transactionNameifyRouterArgument(target: string): string {
  try {
    return new URL(target, 'http://some-random-base.com/').pathname;
  } catch {
    return '/';
  }
}
