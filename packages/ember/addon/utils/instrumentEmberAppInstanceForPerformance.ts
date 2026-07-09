import type ApplicationInstance from '@ember/application/instance';
import type Transition from '@ember/routing/-private/transition';
import type RouterService from '@ember/routing/router-service';
import type {
  startBrowserTracingNavigationSpan as startBrowserTracingNavigationSpanType,
  startBrowserTracingPageLoadSpan as startBrowserTracingPageLoadSpanType,
} from '@sentry/browser';
import {
  getAbsoluteUrl,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startInactiveSpan,
} from '@sentry/browser';
import type { Client, Span } from '@sentry/core';
import type { EmberRouterMain } from '../types';
import { getBackburner } from './performance';

const URL_FULL = 'url.full';
const URL_PATH = 'url.path';
const URL_TEMPLATE = 'url.template';

type TransitionWithIntent = Transition & { intent?: { url?: string } };

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
    currentURL?: string;
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

function getUrlPathFromEmberLocation(url: string): string {
  if (!url) {
    return '/';
  }

  const withoutQuery = url.split('?')[0] ?? url;

  if (withoutQuery.includes('#')) {
    const hashPart = withoutQuery.substring(withoutQuery.indexOf('#') + 1);
    return hashPart.startsWith('/') ? hashPart : `/${hashPart}`;
  }

  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function buildUrlTemplate(path: string, params: Record<string, unknown> = {}): string {
  let template = path;

  const paramEntries = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .sort(([, a], [, b]) => b.length - a.length);

  for (const [key, value] of paramEntries) {
    template = template.replace(`/${value}`, `/:${key}`);
  }

  return template;
}

// Only exported for testing
export function _getRouteUrlAttributes(
  url: string,
  params: Record<string, unknown> = {},
): Record<string, string> {
  const path = getUrlPathFromEmberLocation(url);

  return {
    [URL_PATH]: path,
    [URL_FULL]: getAbsoluteUrl(path),
    [URL_TEMPLATE]: buildUrlTemplate(path, params),
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
  routerService: RouterService & { currentURL?: string },
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
        ..._getRouteUrlAttributes(url, routeInfo.params),
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

    // Only `intent.url` reliably reflects the *destination* URL at `routeWillChange` time. The
    // router's location still points at the current (pre-transition) route here, so falling back to
    // it would tag the navigation span with the previous route's `url.*` attributes. When we don't
    // have a trustworthy target URL, we omit them and let `routeDidChange` set them from `currentURL`.
    const targetUrl = (transition as TransitionWithIntent).intent?.url;
    const urlAttributes = targetUrl ? _getRouteUrlAttributes(targetUrl, transition.to?.params) : {};

    activeRootSpan = startBrowserTracingNavigationSpan(client, {
      name: `route:${toRoute}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.ember',
        ...urlAttributes,
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

    const url = routerService.currentURL ?? _getLocationURL(location);
    if (url) {
      const routeInfo = routerService.recognize(url);
      activeRootSpan.setAttributes(_getRouteUrlAttributes(url, routeInfo.params ?? transition.to?.params));
    }

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
