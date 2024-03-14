/* eslint-disable max-lines */
import type ApplicationInstance from '@ember/application/instance';
import { subscribe } from '@ember/instrumentation';
import type Transition from '@ember/routing/-private/transition';
import type RouterService from '@ember/routing/router-service';
import { _backburner, run, scheduleOnce } from '@ember/runloop';
import type { EmberRunQueues } from '@ember/runloop/-private/types';
import { getOwnConfig, isTesting, macroCondition } from '@embroider/macros';
import type {
  BrowserClient,
  startBrowserTracingNavigationSpan as startBrowserTracingNavigationSpanType,
  startBrowserTracingPageLoadSpan as startBrowserTracingPageLoadSpanType,
} from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  getClient,
  startInactiveSpan,
} from '@sentry/browser';
import type { ExtendedBackburner } from '@sentry/ember/runloop';
import type { Span } from '@sentry/types';
import { GLOBAL_OBJ, browserPerformanceTimeOrigin, timestampInSeconds } from '@sentry/utils';
import type { EmberRouterMain, EmberSentryConfig, GlobalConfig, OwnConfig } from '../types';

function getSentryConfig(): EmberSentryConfig {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  const environmentConfig = getOwnConfig<OwnConfig>().sentryConfig;
  if (!environmentConfig.sentry) {
    environmentConfig.sentry = {
      browserTracingOptions: {},
    };
  }
  Object.assign(environmentConfig.sentry, _global.__sentryEmberConfig);
  return environmentConfig;
}

export function initialize(appInstance: ApplicationInstance): void {
  // Disable in fastboot - we only want to run Sentry client-side
  const fastboot = appInstance.lookup('service:fastboot') as unknown as { isFastBoot: boolean } | undefined;
  if (fastboot?.isFastBoot) {
    return;
  }

  const config = getSentryConfig();
  if (config['disablePerformance']) {
    return;
  }
  const performancePromise = instrumentForPerformance(appInstance);
  if (macroCondition(isTesting())) {
    (window as typeof window & { _sentryPerformanceLoad?: Promise<void> })._sentryPerformanceLoad = performancePromise;
  }
}

function getBackburner(): Pick<ExtendedBackburner, 'on' | 'off'> {
  if (_backburner) {
    return _backburner as unknown as Pick<ExtendedBackburner, 'on' | 'off'>;
  }

  if ((run as unknown as { backburner?: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner) {
    return (run as unknown as { backburner: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner;
  }

  return {
    on() {
      // noop
    },
    off() {
      // noop
    },
  };
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

function getLocationURL(location: EmberRouterMain['location']): string {
  if (!location || !location.getURL || !location.formatURL) {
    return '';
  }
  const url = location.formatURL(location.getURL());

  if (location.implementation === 'hash') {
    return `${location.rootURL}${url}`;
  }
  return url;
}

export function _instrumentEmberRouter(
  routerService: RouterService,
  routerMain: EmberRouterMain,
  config: EmberSentryConfig,
  startBrowserTracingPageLoadSpan: typeof startBrowserTracingPageLoadSpanType,
  startBrowserTracingNavigationSpan: typeof startBrowserTracingNavigationSpanType,
): void {
  const { disableRunloopPerformance } = config;
  const location = routerMain.location;
  let activeRootSpan: Span | undefined;
  let transitionSpan: Span | undefined;

  // Maintaining backwards compatibility with config.browserTracingOptions, but passing it with Sentry options is preferred.
  const browserTracingOptions = config.browserTracingOptions || config.sentry.browserTracingOptions || {};
  const url = getLocationURL(location);

  const client = getClient<BrowserClient>();

  if (!client) {
    return;
  }

  if (url && browserTracingOptions.instrumentPageLoad !== false) {
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

  if (browserTracingOptions.instrumentNavigation === false) {
    return;
  }

  routerService.on('routeWillChange', (transition: Transition) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);
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
    });
  });

  routerService.on('routeDidChange', () => {
    if (!transitionSpan || !activeRootSpan) {
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

function _instrumentEmberRunloop(config: EmberSentryConfig): void {
  const { disableRunloopPerformance, minimumRunloopQueueDuration } = config;
  if (disableRunloopPerformance) {
    return;
  }

  let currentQueueStart: number | undefined;
  let currentQueueSpan: Span | undefined;
  const instrumentedEmberQueues = [
    'actions',
    'routerTransitions',
    'render',
    'afterRender',
    'destroy',
  ] as EmberRunQueues[];

  getBackburner().on('begin', (_: unknown, previousInstance: unknown) => {
    if (previousInstance) {
      return;
    }
    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.end();
    }
    currentQueueStart = timestampInSeconds();

    const processQueue = (queue: EmberRunQueues): void => {
      // Process this queue using the end of the previous queue.
      if (currentQueueStart) {
        const now = timestampInSeconds();
        const minQueueDuration = minimumRunloopQueueDuration ?? 5;

        if ((now - currentQueueStart) * 1000 >= minQueueDuration) {
          startInactiveSpan({
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
            },
            name: 'runloop',
            op: `ui.ember.runloop.${queue}`,
            startTime: currentQueueStart,
          })?.end(now);
        }
        currentQueueStart = undefined;
      }

      // Setup for next queue

      const stillActiveSpan = getActiveSpan();
      if (!stillActiveSpan) {
        return;
      }
      currentQueueStart = timestampInSeconds();
    };

    instrumentedEmberQueues.forEach(queue => {
      scheduleOnce(queue, null, processQueue, queue);
    });
  });
  getBackburner().on('end', (_: unknown, nextInstance: unknown) => {
    if (nextInstance) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.end();
      currentQueueSpan = undefined;
    }
  });
}

type Payload = {
  containerKey: string;
  initialRender: true;
  object: string;
};

type RenderEntry = {
  payload: Payload;
  now: number;
};

interface RenderEntries {
  [name: string]: RenderEntry;
}

function processComponentRenderBefore(payload: Payload, beforeEntries: RenderEntries): void {
  const info = {
    payload,
    now: timestampInSeconds(),
  };
  beforeEntries[payload.object] = info;
}

function processComponentRenderAfter(
  payload: Payload,
  beforeEntries: RenderEntries,
  op: string,
  minComponentDuration: number,
): void {
  const begin = beforeEntries[payload.object];

  if (!begin) {
    return;
  }

  const now = timestampInSeconds();
  const componentRenderDuration = now - begin.now;

  if (componentRenderDuration * 1000 >= minComponentDuration) {
    startInactiveSpan({
      name: payload.containerKey || payload.object,
      op,
      startTime: begin.now,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
      },
    })?.end(now);
  }
}

function _instrumentComponents(config: EmberSentryConfig): void {
  const { disableInstrumentComponents, minimumComponentRenderDuration, enableComponentDefinitions } = config;
  if (disableInstrumentComponents) {
    return;
  }

  const minComponentDuration = minimumComponentRenderDuration ?? 2;

  const beforeEntries = {} as RenderEntries;
  const beforeComponentDefinitionEntries = {} as RenderEntries;

  function _subscribeToRenderEvents(): void {
    subscribe('render.component', {
      before(_name: string, _timestamp: number, payload: Payload) {
        processComponentRenderBefore(payload, beforeEntries);
      },

      after(_name: string, _timestamp: number, payload: Payload, _beganIndex: number) {
        processComponentRenderAfter(payload, beforeEntries, 'ui.ember.component.render', minComponentDuration);
      },
    });
    if (enableComponentDefinitions) {
      subscribe('render.getComponentDefinition', {
        before(_name: string, _timestamp: number, payload: Payload) {
          processComponentRenderBefore(payload, beforeComponentDefinitionEntries);
        },

        after(_name: string, _timestamp: number, payload: Payload, _beganIndex: number) {
          processComponentRenderAfter(payload, beforeComponentDefinitionEntries, 'ui.ember.component.definition', 0);
        },
      });
    }
  }
  _subscribeToRenderEvents();
}

function _instrumentInitialLoad(config: EmberSentryConfig): void {
  const startName = '@sentry/ember:initial-load-start';
  const endName = '@sentry/ember:initial-load-end';

  const { HAS_PERFORMANCE, HAS_PERFORMANCE_TIMING } = _hasPerformanceSupport();

  if (!HAS_PERFORMANCE) {
    return;
  }

  const { performance } = window;

  if (config.disableInitialLoadInstrumentation) {
    performance.clearMarks(startName);
    performance.clearMarks(endName);
    return;
  }

  // Split performance check in two so clearMarks still happens even if timeOrigin isn't available.
  if (!HAS_PERFORMANCE_TIMING || browserPerformanceTimeOrigin === undefined) {
    return;
  }
  const measureName = '@sentry/ember:initial-load';

  const startMarkExists = performance.getEntriesByName(startName).length > 0;
  const endMarkExists = performance.getEntriesByName(endName).length > 0;
  if (!startMarkExists || !endMarkExists) {
    return;
  }

  performance.measure(measureName, startName, endName);
  const measures = performance.getEntriesByName(measureName);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const measure = measures[0]!;

  const startTime = (measure.startTime + browserPerformanceTimeOrigin) / 1000;
  const endTime = startTime + measure.duration / 1000;

  startInactiveSpan({
    op: 'ui.ember.init',
    name: 'init',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
    },
    startTime,
  })?.end(endTime);
  performance.clearMarks(startName);
  performance.clearMarks(endName);

  performance.clearMeasures(measureName);
}

function _hasPerformanceSupport(): { HAS_PERFORMANCE: boolean; HAS_PERFORMANCE_TIMING: boolean } {
  // TS says that all of these methods are always available, but some of them may not be supported in older browsers
  // So we "pretend" they are all optional in order to be able to check this properly without TS complaining
  const _performance = window.performance as {
    clearMarks?: Performance['clearMarks'];
    clearMeasures?: Performance['clearMeasures'];
    measure?: Performance['measure'];
    getEntriesByName?: Performance['getEntriesByName'];
  };
  const HAS_PERFORMANCE = Boolean(_performance && _performance.clearMarks && _performance.clearMeasures);
  const HAS_PERFORMANCE_TIMING = Boolean(
    _performance.measure && _performance.getEntriesByName && browserPerformanceTimeOrigin !== undefined,
  );

  return {
    HAS_PERFORMANCE,
    HAS_PERFORMANCE_TIMING,
  };
}

export async function instrumentForPerformance(appInstance: ApplicationInstance): Promise<void> {
  const config = getSentryConfig();
  // Maintaining backwards compatibility with config.browserTracingOptions, but passing it with Sentry options is preferred.
  const browserTracingOptions = config.browserTracingOptions || config.sentry.browserTracingOptions || {};

  const { browserTracingIntegration, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } =
    await import('@sentry/browser');

  const idleTimeout = config.transitionTimeout || 5000;

  const browserTracing = browserTracingIntegration({
    idleTimeout,
    ...browserTracingOptions,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  const client = getClient<BrowserClient>();

  const isAlreadyInitialized = macroCondition(isTesting()) ? !!client?.getIntegrationByName('BrowserTracing') : false;

  if (client && client.addIntegration) {
    client.addIntegration(browserTracing);
  }

  // We _always_ call this, as it triggers the page load & navigation spans
  _instrumentNavigation(appInstance, config, startBrowserTracingPageLoadSpan, startBrowserTracingNavigationSpan);

  // Skip instrumenting the stuff below again in tests, as these are not reset between tests
  if (isAlreadyInitialized) {
    return;
  }

  _instrumentEmberRunloop(config);
  _instrumentComponents(config);
  _instrumentInitialLoad(config);
}

function _instrumentNavigation(
  appInstance: ApplicationInstance,
  config: EmberSentryConfig,
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
    routerService,
    routerMain,
    config,
    startBrowserTracingPageLoadSpan,
    startBrowserTracingNavigationSpan,
  );
}

export default {
  initialize,
};
