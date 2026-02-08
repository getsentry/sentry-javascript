/**
 * Performance instrumentation for Ember.js applications.
 *
 * This module provides automatic performance tracking for:
 * - Page loads and navigation transitions
 * - Ember runloop queues
 * - Component rendering
 *
 * ## Migration from v1 addon
 *
 * In the v1 addon, performance instrumentation was automatic via an instance-initializer
 * that shipped with the addon. In v2, you must create this initializer yourself.
 *
 * ## Setup
 *
 * 1. Create `app/instance-initializers/sentry-performance.ts`:
 *
 * ```typescript
 * import type ApplicationInstance from '@ember/application/instance';
 * import { setupPerformance } from '@sentry/ember/performance';
 *
 * export function initialize(appInstance: ApplicationInstance): void {
 *   setupPerformance(appInstance);
 * }
 *
 * export default {
 *   initialize,
 * };
 * ```
 *
 * 2. Make sure Sentry is initialized in `app/app.ts` before the application starts:
 *
 * ```typescript
 * import Application from '@ember/application';
 * import * as Sentry from '@sentry/ember';
 *
 * Sentry.init({ dsn: 'YOUR_DSN' });
 *
 * export default class App extends Application {
 *   // ...
 * }
 * ```
 *
 * ## Configuration
 *
 * Pass options to `setupPerformance` to customize behavior:
 *
 * ```typescript
 * setupPerformance(appInstance, {
 *   disableRunloopPerformance: true,
 *   minimumComponentRenderDuration: 5,
 * });
 * ```
 */

import { subscribe, unsubscribe } from '@ember/instrumentation';
import { _backburner, run, scheduleOnce } from '@ember/runloop';
import {
  browserTracingIntegration,
  getActiveSpan,
  getClient,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startInactiveSpan,
} from '@sentry/browser';
import {
  addIntegration,
  browserPerformanceTimeOrigin,
  timestampInSeconds,
} from '@sentry/core';

import type ApplicationInstance from '@ember/application/instance';
import type RouterService from '@ember/routing/router-service';
import type { BrowserClient } from '@sentry/browser';
import type { Span } from '@sentry/core';

// This is private in Ember and not really exported, so we "mock" these types here.
export interface EmberRouterMain {
  location: {
    getURL?: () => string;
    formatURL?: (url: string) => string;
    implementation?: string;
    rootURL: string;
  };
}

// Module-level flag to prevent duplicate global listeners (runloop, components)
// from accumulating across repeated setupPerformance calls (e.g., in tests or ember-engines).
let _isGlobalInstrumentationInitialized = false;

// Cleanup functions for global listeners registered by _instrumentEmberRunloop
// and _instrumentComponents, so they can be torn down on reset.
const _globalCleanupFns: Array<() => void> = [];

/**
 * Reset the global instrumentation state and unsubscribe accumulated listeners.
 * Intended for test teardown only.
 * @internal
 */
export function _resetGlobalInstrumentation(): void {
  _isGlobalInstrumentationInitialized = false;
  for (const cleanup of _globalCleanupFns) {
    cleanup();
  }
  _globalCleanupFns.length = 0;
}

// Ember runloop queue names
type EmberRunQueues =
  | 'sync'
  | 'actions'
  | 'routerTransitions'
  | 'render'
  | 'afterRender'
  | 'destroy';

/**
 * Extended Backburner interface with the 'off' method that's not in the public types.
 */
interface ExtendedBackburner {
  on(eventName: string, callback: (...args: unknown[]) => void): void;
  off(eventName: string, callback: (...args: unknown[]) => void): void;
}

export interface PerformanceOptions {
  /**
   * Whether to disable all performance instrumentation.
   * @default false
   */
  disablePerformance?: boolean;

  /**
   * Whether to disable runloop performance tracking.
   * @default false
   */
  disableRunloopPerformance?: boolean;

  /**
   * Whether to disable component render tracking.
   * @default false
   */
  disableInstrumentComponents?: boolean;

  /**
   * Whether to disable initial page load instrumentation.
   * @default false
   */
  disableInitialLoadInstrumentation?: boolean;

  /**
   * Whether to enable component definition tracking.
   * @default false
   */
  enableComponentDefinitions?: boolean;

  /**
   * Minimum duration (ms) for runloop queue spans to be recorded.
   * @default 5
   */
  minimumRunloopQueueDuration?: number;

  /**
   * Minimum duration (ms) for component render spans to be recorded.
   * @default 2
   */
  minimumComponentRenderDuration?: number;

  /**
   * Timeout (ms) for navigation transitions.
   * @default 5000
   */
  transitionTimeout?: number;

  /**
   * Options to pass to browserTracingIntegration.
   */
  browserTracingOptions?: Parameters<typeof browserTracingIntegration>[0];
}

function getBackburner(): Pick<ExtendedBackburner, 'on' | 'off'> {
  if (_backburner) {
    return _backburner as unknown as Pick<ExtendedBackburner, 'on' | 'off'>;
  }

  if (
    (run as unknown as { backburner?: Pick<ExtendedBackburner, 'on' | 'off'> })
      .backburner
  ) {
    return (
      run as unknown as { backburner: Pick<ExtendedBackburner, 'on' | 'off'> }
    ).backburner;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transition: any,
  router: RouterService,
): { fromRoute?: string; toRoute?: string } {
  const fromRoute = transition?.from?.name as string | undefined;
  const toRoute =
    (transition?.to?.name as string | undefined) ||
    router.currentRouteName ||
    undefined;
  return {
    fromRoute,
    toRoute,
  };
}

/**
 * Get the current URL from the Ember router location.
 */
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
  routerService: RouterService,
  routerMain: EmberRouterMain,
  options: PerformanceOptions,
): void {
  const { disableRunloopPerformance, browserTracingOptions = {} } = options;
  const location = routerMain.location;
  let activeRootSpan: Span | undefined;
  let transitionSpan: Span | undefined;

  const url = _getLocationURL(location);

  const client = getClient<BrowserClient>();

  if (!client) {
    return;
  }

  if (url && browserTracingOptions.instrumentPageLoad !== false) {
    let routeInfo;
    try {
      routeInfo = routerService.recognize(url);
    } catch {
      // Fall through — skip page load span but continue with router instrumentation
    }
    if (routeInfo) {
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
  }

  function createFinishActiveTransaction(
    spanToFinish: Span,
  ): (_: unknown, nextInstance: unknown) => void {
    const handler = (_: unknown, nextInstance: unknown): void => {
      if (nextInstance) {
        return;
      }
      spanToFinish.end();
      getBackburner().off('end', handler);
    };
    return handler;
  }

  if (browserTracingOptions.instrumentNavigation === false) {
    return;
  }

  routerService.on('routeWillChange', (transition) => {
    const { fromRoute, toRoute } = getTransitionInformation(
      transition,
      routerService,
    );

    // We want to ignore loading && error routes
    if (transitionIsIntermediate(transition)) {
      return;
    }

    activeRootSpan?.end();
    transitionSpan?.end();

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

  routerService.on('routeDidChange', (transition) => {
    if (
      !transitionSpan ||
      !activeRootSpan ||
      transitionIsIntermediate(transition)
    ) {
      return;
    }
    transitionSpan.end();

    if (disableRunloopPerformance) {
      activeRootSpan.end();
      return;
    }

    getBackburner().on('end', createFinishActiveTransaction(activeRootSpan));
  });
}

function _instrumentEmberRunloop(options: PerformanceOptions): void {
  const { disableRunloopPerformance, minimumRunloopQueueDuration } = options;
  if (disableRunloopPerformance) {
    return;
  }

  let currentQueueStart: number | undefined;
  const instrumentedEmberQueues = [
    'actions',
    'routerTransitions',
    'render',
    'afterRender',
    'destroy',
  ] as EmberRunQueues[];

  const beginHandler = (_: unknown, previousInstance: unknown): void => {
    if (previousInstance) {
      return;
    }
    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      return;
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
            onlyIfParent: true,
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

    instrumentedEmberQueues.forEach((queue) => {
      // eslint-disable-next-line ember/no-runloop -- scheduleOnce is the only way to instrument Ember's backburner queues
      scheduleOnce(queue, null, processQueue, queue);
    });
  };

  getBackburner().on('begin', beginHandler);
  _globalCleanupFns.push(() => getBackburner().off('begin', beginHandler));
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

function processComponentRenderBefore(
  payload: Payload,
  beforeEntries: RenderEntries,
): void {
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
  delete beforeEntries[payload.object];

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
      onlyIfParent: true,
    })?.end(now);
  }
}

function _instrumentComponents(options: PerformanceOptions): void {
  const {
    disableInstrumentComponents,
    minimumComponentRenderDuration,
    enableComponentDefinitions,
  } = options;
  if (disableInstrumentComponents) {
    return;
  }

  const minComponentDuration = minimumComponentRenderDuration ?? 2;

  const beforeEntries = {} as RenderEntries;
  const beforeComponentDefinitionEntries = {} as RenderEntries;

  function _subscribeToRenderEvents(): void {
    const renderSub = subscribe<void>('render.component', {
      before(_name: string, _timestamp: number, payload: object) {
        processComponentRenderBefore(payload as Payload, beforeEntries);
      },

      after(_name: string, _timestamp: number, payload: object) {
        processComponentRenderAfter(
          payload as Payload,
          beforeEntries,
          'ui.ember.component.render',
          minComponentDuration,
        );
      },
    });
    _globalCleanupFns.push(() => unsubscribe(renderSub));

    if (enableComponentDefinitions) {
      const defSub = subscribe('render.getComponentDefinition', {
        before(_name: string, _timestamp: number, payload: object) {
          processComponentRenderBefore(
            payload as Payload,
            beforeComponentDefinitionEntries,
          );
        },

        after(_name: string, _timestamp: number, payload: object) {
          processComponentRenderAfter(
            payload as Payload,
            beforeComponentDefinitionEntries,
            'ui.ember.component.definition',
            0,
          );
        },
      });
      _globalCleanupFns.push(() => unsubscribe(defSub));
    }
  }
  _subscribeToRenderEvents();
}

function _instrumentInitialLoad(options: PerformanceOptions): void {
  const startName = '@sentry/ember:initial-load-start';
  const endName = '@sentry/ember:initial-load-end';

  const { HAS_PERFORMANCE, HAS_PERFORMANCE_TIMING, performanceTimeOrigin } =
    _hasPerformanceSupport();

  if (!HAS_PERFORMANCE) {
    return;
  }

  const { performance } = window;

  if (options.disableInitialLoadInstrumentation) {
    performance.clearMarks(startName);
    performance.clearMarks(endName);
    return;
  }

  // Split performance check in two so clearMarks still happens even if timeOrigin isn't available.
  if (!HAS_PERFORMANCE_TIMING || performanceTimeOrigin === undefined) {
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

  const measure = measures[0]!;

  const startTime = (measure.startTime + performanceTimeOrigin) / 1000;
  const endTime = startTime + measure.duration / 1000;

  startInactiveSpan({
    op: 'ui.ember.init',
    name: 'init',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
    },
    startTime,
    onlyIfParent: true,
  })?.end(endTime);
  performance.clearMarks(startName);
  performance.clearMarks(endName);

  performance.clearMeasures(measureName);
}

function _hasPerformanceSupport(): {
  HAS_PERFORMANCE: boolean;
  HAS_PERFORMANCE_TIMING: boolean;
  performanceTimeOrigin: number | undefined;
} {
  // TS says that all of these methods are always available, but some of them may not be supported in older browsers
  // So we "pretend" they are all optional in order to be able to check this properly without TS complaining
  const _performance = window.performance as {
    clearMarks?: Performance['clearMarks'];
    clearMeasures?: Performance['clearMeasures'];
    measure?: Performance['measure'];
    getEntriesByName?: Performance['getEntriesByName'];
  };
  const HAS_PERFORMANCE = Boolean(
    _performance?.clearMarks && _performance.clearMeasures,
  );
  const origin = browserPerformanceTimeOrigin();
  const HAS_PERFORMANCE_TIMING = Boolean(
    _performance.measure &&
    _performance.getEntriesByName &&
    origin !== undefined,
  );

  return {
    HAS_PERFORMANCE,
    HAS_PERFORMANCE_TIMING,
    performanceTimeOrigin: origin,
  };
}

/**
 * Set up Sentry performance instrumentation for an Ember application.
 *
 * This should be called from an instance-initializer after Sentry has been initialized.
 *
 * @param appInstance - The Ember ApplicationInstance
 * @param options - Performance instrumentation options
 *
 * @example
 * ```typescript
 * // app/instance-initializers/sentry-performance.ts
 * import type ApplicationInstance from '@ember/application/instance';
 * import { setupPerformance } from '@sentry/ember/performance';
 *
 * export function initialize(appInstance: ApplicationInstance): void {
 *   setupPerformance(appInstance, {
 *     transitionTimeout: 5000,
 *   });
 * }
 *
 * export default {
 *   initialize,
 * };
 * ```
 */
export function setupPerformance(
  appInstance: ApplicationInstance,
  options: PerformanceOptions = {},
): void {
  // Disable in fastboot - we only want to run Sentry client-side
  const fastboot = appInstance.lookup('service:fastboot') as unknown as
    | { isFastBoot: boolean }
    | undefined;
  if (fastboot?.isFastBoot) {
    return;
  }

  if (options.disablePerformance) {
    return;
  }

  // Instrument global singletons (runloop, components, initial load) independently
  // of router state — these should work even if the router is unavailable.
  if (!_isGlobalInstrumentationInitialized) {
    _isGlobalInstrumentationInitialized = true;
    _instrumentEmberRunloop(options);
    _instrumentComponents(options);
    _instrumentInitialLoad(options);
  }

  const browserTracingOptions = options.browserTracingOptions ?? {};
  const idleTimeout = options.transitionTimeout ?? 5000;

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

  const browserTracing = browserTracingIntegration({
    idleTimeout,
    ...browserTracingOptions,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  addIntegration(browserTracing);

  routerService._hasMountedSentryPerformanceRouting = true;
  _instrumentEmberRouter(routerService, routerMain, options);
}

function transitionIsIntermediate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transition: any,
): boolean {
  // We want to use ignore, as this may actually be defined on new versions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore This actually exists on newer versions
  const isIntermediate: boolean | undefined = transition.isIntermediate;

  if (typeof isIntermediate === 'boolean') {
    return isIntermediate;
  }

  // For versions without this, we look if the route is a `.loading` or `.error` route
  // This is not perfect and may false-positive in some cases, but it's the best we can do
  return (
    transition.to?.localName === 'loading' ||
    transition.to?.localName === 'error'
  );
}
