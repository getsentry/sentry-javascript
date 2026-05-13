import { subscribe, unsubscribe } from '@ember/instrumentation';
import { _backburner, run, scheduleOnce } from '@ember/runloop';
import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  getActiveSpan,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startInactiveSpan,
} from '@sentry/browser';
import {
  addIntegration,
  timestampInSeconds,
} from '@sentry/core';
import {
  getLocationURL,
  getTransitionInformation,
  isTransitionIntermediate,
} from '../ember/router.ts';

import type ApplicationInstance from '@ember/application/instance';
import type RouterService from '@ember/routing/router-service';
import type { BrowserClient } from '@sentry/browser';
import type { Integration, Span } from '@sentry/core';
import type { EmberRouterMain } from '../ember/router.ts';

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
  | 'actions'
  | 'afterRender'
  | 'destroy'
  | 'render'
  | 'routerTransitions'
  | 'sync';

/**
 * Extended Backburner interface with the 'off' method that's not in the public types.
 */
interface ExtendedBackburner {
  on(eventName: string, callback: (...args: unknown[]) => void): void;
  off(eventName: string, callback: (...args: unknown[]) => void): void;
}

/**
 * Options for the Ember-specific browserTracingIntegration.
 */
export interface EmberBrowserTracingOptions extends Omit<Parameters<typeof originalBrowserTracingIntegration>[0], 'instrumentNavigation' | 'instrumentPageLoad'> {
  /**
   * The Ember ApplicationInstance, required for router instrumentation.
   */
  appInstance: ApplicationInstance;

  /**
   * Whether to disable component render tracking.
   * @default false
   */
  disableInstrumentComponents?: boolean;

  /**
   * Whether to disable runloop performance tracking.
   * @default false
   */
  disableRunloopPerformance?: boolean;

  /**
   * Whether to enable component definition tracking.
   * @default false
   */
  enableComponentDefinitions?: boolean;

  /**
   * The time (ms) that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   * @default 5000
   */
  idleTimeout?: number;

  /**
   * Whether to instrument navigation spans.
   * @default true
   */
  instrumentNavigation?: boolean;

  /**
   * Whether to instrument page load spans.
   * @default true
   */
  instrumentPageLoad?: boolean;

  /**
   * Minimum duration (ms) for component render spans to be recorded.
   * @default 2
   */
  minimumComponentRenderDuration?: number;

  /**
   * Minimum duration (ms) for runloop queue spans to be recorded.
   * @default 5
   */
  minimumRunloopQueueDuration?: number;
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

function _instrumentEmberRouter(
  routerService: RouterService,
  routerMain: EmberRouterMain,
  client: BrowserClient,
  options: {
    disableRunloopPerformance?: boolean;
    instrumentNavigation?: boolean;
    instrumentPageLoad?: boolean;
  },
): void {
  const { disableRunloopPerformance } = options;
  const location = routerMain.location;
  let activeRootSpan: Span | undefined;
  let transitionSpan: Span | undefined;

  const url = getLocationURL(location);

  if (url && options.instrumentPageLoad !== false) {
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

  if (options.instrumentNavigation === false) {
    return;
  }

  routerService.on('routeWillChange', (transition) => {
    const { fromRoute, toRoute } = getTransitionInformation(
      transition,
      routerService,
    );

    // We want to ignore loading && error routes
    if (isTransitionIntermediate(transition)) {
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
      isTransitionIntermediate(transition)
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

function _instrumentEmberRunloop(options: { disableRunloopPerformance?: boolean; minimumRunloopQueueDuration?: number }): void {
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

function _instrumentComponents(options: { disableInstrumentComponents?: boolean; minimumComponentRenderDuration?: number; enableComponentDefinitions?: boolean }): void {
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

/**
 * A custom `browserTracingIntegration` for Ember.js applications.
 *
 * This wraps the standard browser tracing integration with Ember-specific
 * router instrumentation, runloop tracking, and component render tracking.
 *
 * @param options - Ember browser tracing options including `appInstance`
 * @returns A Sentry integration
 *
 * @example
 * ```typescript
 * // app/instance-initializers/sentry-performance.ts
 * import type ApplicationInstance from '@ember/application/instance';
 * import { browserTracingIntegration, addIntegration } from '@sentry/ember';
 *
 * export function initialize(appInstance: ApplicationInstance): void {
 *   addIntegration(browserTracingIntegration({ appInstance }));
 * }
 *
 * export default { initialize };
 * ```
 */
export function browserTracingIntegration(options: EmberBrowserTracingOptions): Integration {
  const {
    appInstance,
    disableInstrumentComponents,
    disableRunloopPerformance,
    enableComponentDefinitions,
    instrumentNavigation = true,
    instrumentPageLoad = true,
    minimumComponentRenderDuration,
    minimumRunloopQueueDuration,
    idleTimeout = 5000,
    ...baseBrowserTracingOptions
  } = options;

  const integration = originalBrowserTracingIntegration({
    ...baseBrowserTracingOptions,
    idleTimeout,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      // Disable in fastboot - we only want to run Sentry client-side
      const fastboot = appInstance.lookup('service:fastboot') as unknown as
        | { isFastBoot: boolean }
        | undefined;
      if (fastboot?.isFastBoot) {
        return;
      }

      // Instrument global singletons (runloop, components) independently
      // of router state — these should work even if the router is unavailable.
      if (!_isGlobalInstrumentationInitialized) {
        _isGlobalInstrumentationInitialized = true;
        _instrumentEmberRunloop({ disableRunloopPerformance, minimumRunloopQueueDuration });
        _instrumentComponents({ disableInstrumentComponents, minimumComponentRenderDuration, enableComponentDefinitions });
      }

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
      _instrumentEmberRouter(routerService, routerMain, client as BrowserClient, {
        disableRunloopPerformance,
        instrumentNavigation,
        instrumentPageLoad,
      });
    },
  };
}

/**
 * Set up Sentry performance instrumentation for an Ember application.
 *
 * This is a convenience function that creates and adds the Ember
 * `browserTracingIntegration`. For more control, use the integration directly.
 *
 * @param appInstance - The Ember ApplicationInstance
 * @param options - Performance instrumentation options
 *
 * @example
 * ```typescript
 * // app/instance-initializers/sentry-performance.ts
 * import type ApplicationInstance from '@ember/application/instance';
 * import { setupPerformance } from '@sentry/ember';
 *
 * export function initialize(appInstance: ApplicationInstance): void {
 *   setupPerformance(appInstance);
 * }
 *
 * export default { initialize };
 * ```
 */
export function setupPerformance(
  appInstance: ApplicationInstance,
  options: Omit<EmberBrowserTracingOptions, 'appInstance'> = {},
): void {
  addIntegration(browserTracingIntegration({ appInstance, ...options }));
}
