import type ApplicationInstance from '@ember/application/instance';
import type Transition from '@ember/routing/transition';
import type RouterService from '@ember/routing/router-service';
import type {
  startBrowserTracingNavigationSpan as startBrowserTracingNavigationSpanType,
  startBrowserTracingPageLoadSpan as startBrowserTracingPageLoadSpanType,
} from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startInactiveSpan,
  WINDOW,
} from '@sentry/browser';
import { getCurrentScope, spanToJSON, type Client, type Span } from '@sentry/core';
import { getBackburner } from './utils.ts';

interface EmberRouterMain {
  location: {
    formatURL?: (url: string) => string;
    getURL?: () => string;
    implementation?: string;
    rootURL: string;
  };
}

export function instrumentEmberAppInstanceForPerformance(
  client: Client,
  appInstance: ApplicationInstance,
  config: { disableRunloopPerformance?: boolean; instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
  startBrowserTracingPageLoadSpan: typeof startBrowserTracingPageLoadSpanType,
  startBrowserTracingNavigationSpan: typeof startBrowserTracingNavigationSpanType,
): void {
  const { disableRunloopPerformance, instrumentPageLoad, instrumentNavigation } = config;
  const routerService = getRouterService(appInstance);

  if (routerService._hasMountedSentryPerformanceRouting) {
    // Routing listens to route changes on the main router, and should not be initialized multiple times per page.
    return;
  }
  if (!routerService.recognize) {
    // Router is missing critical functionality to limit cardinality of the transaction names.
    return;
  }

  const routerMain = getRouterMain(appInstance);
  const location = routerMain.location;
  let activeRootSpan: Span | undefined;
  let transitionSpan: Span | undefined;

  const url = _getLocationURL(location);

  if (instrumentPageLoad !== false) {
    // Somehow the router service etc. may not be fully ready/initialized yet at this point
    // Probably because we are running this before the Ember setup is necessarily completed
    // So in order to accomodate this, we fall back to starting the pageload span with the current URL and update it later
    const routeInfo = url ? routerService.recognize(url) : undefined;

    activeRootSpan = startBrowserTracingPageLoadSpan(client, {
      name: routeInfo ? `route:${routeInfo.name}` : url || WINDOW.location.pathname,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeInfo ? 'route' : 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.ember',
        url,
        toRoute: routeInfo?.name,
      },
    });
  }

  const finishActiveTransaction = (_: unknown, nextInstance: unknown): void => {
    if (nextInstance) {
      return;
    }
    activeRootSpan?.end();
    getBackburner().off('end', finishActiveTransaction);
  };

  routerService.on('routeWillChange', (transition: Transition) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);

    // Store this here to be used, even if the active span has ended
    getCurrentScope().setTransactionName(`route:${toRoute}`);

    // We want to ignore loading && error routes
    if (transitionIsIntermediate(transition)) {
      return;
    }

    // If this is not the initial transition, we want to end the active root span and start a new one
    if (fromRoute != null) {
      activeRootSpan?.end();

      if (instrumentNavigation !== false) {
        activeRootSpan = startBrowserTracingNavigationSpan(client, {
          name: `route:${toRoute}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.ember',
            fromRoute,
            toRoute,
          },
        });
      }
    } else if (activeRootSpan && spanToJSON(activeRootSpan).data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'url') {
      // We make sure to update the pageload span with the current URL, if we couldn't get it before
      // In this case we re-load the router:main reference, as this may change and we may have a stale reference
      const location = getRouterMain(appInstance).location;
      const url = _getLocationURL(location);
      if (url) {
        activeRootSpan.updateName(`route:${toRoute}`);
        activeRootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          url,
          toRoute: toRoute,
        });
      }
    }

    // transition spans are only emitted if instrumentNavigation is true
    if (instrumentNavigation === false) {
      return;
    }

    transitionSpan = startInactiveSpan({
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
      },
      op: 'ui.ember.transition',
      name: `route:${fromRoute} -> route:${toRoute}`,
      onlyIfParent: true,
    });
  });

  routerService.on('routeDidChange', transition => {
    if (!transitionSpan || !activeRootSpan || transitionIsIntermediate(transition)) {
      return;
    }
    transitionSpan.end();

    if (disableRunloopPerformance) {
      activeRootSpan.end();
      return;
    }

    getBackburner().on('end', finishActiveTransaction);
  });
}

function getRouterService(
  appInstance: ApplicationInstance,
): RouterService & { _hasMountedSentryPerformanceRouting?: boolean } {
  const routerService = appInstance.lookup('service:router') as RouterService & {
    externalRouter?: RouterService;
    _hasMountedSentryPerformanceRouting?: boolean;
  };

  if (routerService.externalRouter) {
    // Using ember-engines-router-service in an engine.
    return routerService.externalRouter;
  }

  return routerService;
}

function getRouterMain(appInstance: ApplicationInstance): EmberRouterMain {
  return appInstance.lookup('router:main') as EmberRouterMain;
}

function getTransitionInformation(
  transition: Transition | undefined,
  router: RouterService,
): { fromRoute?: string; toRoute?: string } {
  const fromRoute = transition?.from?.name;
  const toRoute = transition?.to?.name ?? router.currentRouteName ?? undefined;

  return {
    fromRoute,
    toRoute,
  };
}

// Only exported for testing
export function _getLocationURL(location: EmberRouterMain['location']): string {
  if (!location?.getURL || !location?.formatURL) {
    return '';
  }
  const url = location.formatURL(location.getURL());

  // `implementation` is optional in Ember's predefined location types, so we also check if the URL starts with '#'.
  if (location.implementation === 'hash' || url.startsWith('#')) {
    return `${location.rootURL}${url}`;
  }
  return url;
}

function transitionIsIntermediate(transition: Transition): boolean {
  //  We want to use ignore, as this may actually be defined on new versions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore This actually exists on newer versions
  const isIntermediate: boolean | undefined = transition.isIntermediate;

  if (typeof isIntermediate === 'boolean') {
    return isIntermediate;
  }

  // For versions without this, we look if the route is a `.loading` or `.error` route
  // This is not perfect and may false-positive in some cases, but it's the best we can do
  return transition.to?.localName === 'loading' || transition.to?.localName === 'error';
}
