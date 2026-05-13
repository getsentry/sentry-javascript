import type ApplicationInstance from '@ember/application/instance';
import type Transition from '@ember/routing/-private/transition';
import type RouterService from '@ember/routing/router-service';
import type {
  startBrowserTracingNavigationSpan as startBrowserTracingNavigationSpanType,
  startBrowserTracingPageLoadSpan as startBrowserTracingPageLoadSpanType,
} from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, startInactiveSpan } from '@sentry/browser';
import type { Client, Span } from '@sentry/core';
import type { EmberRouterMain } from '../types';
import { getBackburner } from './performance';

export function instrumentEmberAppInstanceForPerformance(
  client: Client,
  appInstance: ApplicationInstance,
  config: { disableRunloopPerformance?: boolean; instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
  startBrowserTracingPageLoadSpan: typeof startBrowserTracingPageLoadSpanType,
  startBrowserTracingNavigationSpan: typeof startBrowserTracingNavigationSpanType,
): void {
  // eslint-disable-next-line ember/no-private-routing-service
  const routerMain = appInstance.lookup('router:main') as EmberRouterMain;
  let routerService = appInstance.lookup('service:router') as RouterService & {
    externalRouter?: RouterService;
    _hasMountedSentryPerformanceRouting?: boolean;
  };

  if (routerService.externalRouter) {
    // Using ember-engines-router-service in an engine.
    routerService = routerService.externalRouter;
  }
  if (routerService._hasMountedSentryPerformanceRouting) {
    // Routing listens to route changes on the main router, and should not be initialized multiple times per page.
    return;
  }
  if (!routerService.recognize) {
    // Router is missing critical functionality to limit cardinality of the transaction names.
    return;
  }

  routerService._hasMountedSentryPerformanceRouting = true;
  _instrumentEmberRouter(
    client,
    routerService,
    routerMain,
    config,
    startBrowserTracingPageLoadSpan,
    startBrowserTracingNavigationSpan,
  );
}

function getTransitionInformation(
  transition: Transition | undefined,
  router: RouterService,
): { fromRoute?: string; toRoute?: string } {
  const fromRoute = transition?.from?.name;
  const toRoute = transition?.to?.name || router.currentRouteName;
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

function _instrumentEmberRouter(
  client: Client,
  routerService: RouterService,
  routerMain: EmberRouterMain,
  config: { disableRunloopPerformance?: boolean; instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
  startBrowserTracingPageLoadSpan: typeof startBrowserTracingPageLoadSpanType,
  startBrowserTracingNavigationSpan: typeof startBrowserTracingNavigationSpanType,
): void {
  const { disableRunloopPerformance, instrumentPageLoad, instrumentNavigation } = config;
  const location = routerMain.location;
  let activeRootSpan: Span | undefined;
  let transitionSpan: Span | undefined;

  const url = _getLocationURL(location);

  if (url && instrumentPageLoad !== false) {
    const routeInfo = routerService.recognize(url);
    activeRootSpan = startBrowserTracingPageLoadSpan(client, {
      name: `route:${routeInfo.name}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.ember',
        url,
        toRoute: routeInfo.name,
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

  if (instrumentNavigation === false) {
    return;
  }

  routerService.on('routeWillChange', (transition: Transition) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);

    // We want to ignore loading && error routes
    if (transitionIsIntermediate(transition)) {
      return;
    }

    activeRootSpan?.end();

    activeRootSpan = startBrowserTracingNavigationSpan(client, {
      name: `route:${toRoute}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.ember',
        fromRoute,
        toRoute,
      },
    });

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
