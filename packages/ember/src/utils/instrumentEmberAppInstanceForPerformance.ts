import type ApplicationInstance from '@ember/application/instance';
import type Transition from '@ember/routing/transition';
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
  WINDOW,
} from '@sentry/browser';
import { SENTRY_OP, URL_FULL, URL_PATH, URL_TEMPLATE } from '@sentry/conventions/attributes';
import { filterCollectedUrl, getCurrentScope, spanToJSON, type Client, type Span } from '@sentry/core';
import { getBackburner } from './utils.ts';

interface EmberRouterMain {
  location: {
    formatURL?: (url: string) => string;
    getURL?: () => string;
    implementation?: string;
    rootURL: string;
  };
}

type TransitionWithIntent = Transition & { intent?: { url?: string } };

export function instrumentEmberAppInstanceForPerformance(
  client: Client,
  appInstance: ApplicationInstance,
  config: { disableRunloopPerformance?: boolean; instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
  startBrowserTracingPageLoadSpan: typeof startBrowserTracingPageLoadSpanType,
  startBrowserTracingNavigationSpan: typeof startBrowserTracingNavigationSpanType,
): void {
  const { disableRunloopPerformance, instrumentPageLoad, instrumentNavigation } = config;
  const routerService = getRouterService(appInstance);

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
        ...(url ? _getRouteUrlAttributes(url, routeInfo?.params) : {}),
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
      }
    } else if (activeRootSpan && spanToJSON(activeRootSpan).data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'url') {
      // We make sure to update the pageload span with the current URL, if we couldn't get it before
      // In this case we re-load the router:main reference, as this may change and we may have a stale reference
      const location = getRouterMain(appInstance).location;
      const url = _getLocationURL(location);
      if (url) {
        const routeInfo = routerService.recognize(url);
        activeRootSpan.updateName(`route:${toRoute}`);
        activeRootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          ..._getRouteUrlAttributes(url, routeInfo?.params),
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
        // TODO(conventions): Replace `'router'` with the `router` span op constant once it is released in `@sentry/conventions`.
        [SENTRY_OP]: 'router',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
      },
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
      // `currentURL` is the normalized route path and never includes the hash fragment, so we source
      // `url.full` from the location URL (which preserves `#/...` for hash-location apps) when available.
      const fullUrl = _getLocationURL(location) || url;
      activeRootSpan.setAttributes(_getRouteUrlAttributes(url, routeInfo?.params ?? transition.to?.params, fullUrl));
    }

    if (disableRunloopPerformance) {
      activeRootSpan.end();
      return;
    }

    getBackburner().on('end', finishActiveTransaction);
  });
}

function getRouterService(appInstance: ApplicationInstance): RouterService {
  const routerService = appInstance.lookup('service:router') as RouterService & {
    externalRouter?: RouterService;
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
  fullUrl: string = url,
): Record<string, string> {
  const path = getUrlPathFromEmberLocation(url);

  // `url.full` is derived from the unstripped URL so that hash-location apps keep their `#/...`
  // fragment (e.g. `https://host/#/tracing`), which would otherwise be lost by `getUrlPathFromEmberLocation`.
  return {
    [URL_PATH]: path,
    [URL_FULL]: filterCollectedUrl(getAbsoluteUrl(fullUrl)),
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
