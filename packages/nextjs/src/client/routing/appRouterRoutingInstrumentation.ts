import type { Client, Span } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan, WINDOW } from '@sentry/react';
import { maybeParameterizeRoute } from './parameterization';

export const INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME = 'incomplete-app-router-transaction';

/**
 * This mutable keeps track of what router navigation instrumentation mechanism we are using.
 *
 * The default one is 'router-patch' which is a way of instrumenting that worked up until Next.js 15.3.0 was released.
 * For this method we took the global router instance and simply monkey patched all the router methods like push(), replace(), and so on.
 * This worked because Next.js itself called the router methods for things like the <Link /> component.
 * Vercel decided that it is not good to call these public API methods from within the framework so they switched to an internal system that completely bypasses our monkey patching. This happened in 15.3.0.
 *
 * We raised with Vercel that this breaks our SDK so together with them we came up with an API for `instrumentation-client.ts` called `onRouterTransitionStart` that is called whenever a navigation is kicked off.
 *
 * Now we have the problem of version compatibility.
 * For older Next.js versions we cannot use the new hook so we need to always patch the router.
 * For newer Next.js versions we cannot know whether the user actually registered our handler for the `onRouterTransitionStart` hook, so we need to wait until it was called at least once before switching the instrumentation mechanism.
 * The problem is, that the user may still have registered a hook and then call a patched router method.
 * First, the monkey patched router method will be called, starting a navigation span, then the hook will also called.
 * We need to handle this case and not create two separate navigation spans but instead update the current navigation span and then switch to the new instrumentation mode.
 * This is all denoted by this `navigationRoutingMode` variable.
 */
let navigationRoutingMode: 'router-patch' | 'transition-start-hook' = 'router-patch';

const currentRouterPatchingNavigationSpanRef: NavigationSpanRef = { current: undefined };

/** Instruments the Next.js app router for pageloads. */
export function appRouterInstrumentPageLoad(client: Client): void {
  const parameterizedPathname = maybeParameterizeRoute(WINDOW.location.pathname);
  const origin = browserPerformanceTimeOrigin();
  startBrowserTracingPageLoadSpan(client, {
    name: parameterizedPathname ?? WINDOW.location.pathname,
    // pageload should always start at timeOrigin (and needs to be in s, not ms)
    startTime: origin ? origin / 1000 : undefined,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.nextjs.app_router_instrumentation',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedPathname ? 'route' : 'url',
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

const globalWithInjectedBasePath = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryBasePath: string | undefined;
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
  routerTransitionHandler = (href, navigationType) => {
    const basePath = process.env._sentryBasePath ?? globalWithInjectedBasePath._sentryBasePath;
    const normalizedHref = basePath && !href.startsWith(basePath) ? `${basePath}${href}` : href;
    const unparameterizedPathname = new URL(normalizedHref, WINDOW.location.href).pathname;
    const parameterizedPathname = maybeParameterizeRoute(unparameterizedPathname);
    const pathname = parameterizedPathname ?? unparameterizedPathname;

    if (navigationRoutingMode === 'router-patch') {
      navigationRoutingMode = 'transition-start-hook';
    }

    const currentNavigationSpan = currentRouterPatchingNavigationSpanRef.current;
    if (currentNavigationSpan) {
      currentNavigationSpan.updateName(pathname);
      currentNavigationSpan.setAttributes({
        'navigation.type': `router.${navigationType}`,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedPathname ? 'route' : 'url',
      });
      currentRouterPatchingNavigationSpanRef.current = undefined;
    } else {
      startBrowserTracingNavigationSpan(client, {
        name: pathname,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedPathname ? 'route' : 'url',
          'navigation.type': `router.${navigationType}`,
        },
      });
    }
  };

  WINDOW.addEventListener('popstate', () => {
    const parameterizedPathname = maybeParameterizeRoute(WINDOW.location.pathname);
    if (currentRouterPatchingNavigationSpanRef.current?.isRecording()) {
      currentRouterPatchingNavigationSpanRef.current.updateName(parameterizedPathname ?? WINDOW.location.pathname);
      currentRouterPatchingNavigationSpanRef.current.setAttribute(
        SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
        parameterizedPathname ? 'route' : 'url',
      );
    } else {
      currentRouterPatchingNavigationSpanRef.current = startBrowserTracingNavigationSpan(client, {
        name: parameterizedPathname ?? WINDOW.location.pathname,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedPathname ? 'route' : 'url',
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

      patchRouter(client, router, currentRouterPatchingNavigationSpanRef);

      // If the router at any point gets overridden - patch again
      (['nd', 'next'] as const).forEach(globalValueName => {
        const globalValue = GLOBAL_OBJ_WITH_NEXT_ROUTER[globalValueName];
        if (globalValue) {
          GLOBAL_OBJ_WITH_NEXT_ROUTER[globalValueName] = new Proxy(globalValue, {
            set(target, p, newValue) {
              if (p === 'router' && typeof newValue === 'object' && newValue !== null) {
                patchRouter(client, newValue, currentRouterPatchingNavigationSpanRef);
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
          if (navigationRoutingMode !== 'router-patch') {
            return target.apply(thisArg, argArray);
          }

          let transactionName = INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME;
          const transactionAttributes: Record<string, string> = {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.app_router_instrumentation',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          };

          const href = argArray[0];
          const basePath = process.env._sentryBasePath ?? globalWithInjectedBasePath._sentryBasePath;
          const normalizedHref =
            basePath && typeof href === 'string' && !href.startsWith(basePath) ? `${basePath}${href}` : href;
          if (routerFunctionName === 'push') {
            transactionName = transactionNameifyRouterArgument(normalizedHref);
            transactionAttributes['navigation.type'] = 'router.push';
          } else if (routerFunctionName === 'replace') {
            transactionName = transactionNameifyRouterArgument(normalizedHref);
            transactionAttributes['navigation.type'] = 'router.replace';
          } else if (routerFunctionName === 'back') {
            transactionAttributes['navigation.type'] = 'router.back';
          } else if (routerFunctionName === 'forward') {
            transactionAttributes['navigation.type'] = 'router.forward';
          }

          const parameterizedPathname = maybeParameterizeRoute(transactionName);

          currentNavigationSpanRef.current = startBrowserTracingNavigationSpan(client, {
            name: parameterizedPathname ?? transactionName,
            attributes: {
              ...transactionAttributes,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedPathname ? 'route' : 'url',
            },
          });

          return target.apply(thisArg, argArray);
        },
      });
    }
  });
}

let routerTransitionHandler: undefined | ((href: string, navigationType: string) => void) = undefined;

/**
 * A handler for Next.js' `onRouterTransitionStart` hook in `instrumentation-client.ts` to record navigation spans in Sentry.
 */
export function captureRouterTransitionStart(href: string, navigationType: string): void {
  if (routerTransitionHandler) {
    routerTransitionHandler(href, navigationType);
  }
}
