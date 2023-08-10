/* eslint-disable max-lines */
import type ApplicationInstance from '@ember/application/instance';
import { subscribe } from '@ember/instrumentation';
import type Transition from '@ember/routing/-private/transition';
import type RouterService from '@ember/routing/router-service';
import { _backburner, run, scheduleOnce } from '@ember/runloop';
import type { EmberRunQueues } from '@ember/runloop/-private/types';
import { getOwnConfig, isTesting, macroCondition } from '@embroider/macros';
import * as Sentry from '@sentry/browser';
import type { ExtendedBackburner } from '@sentry/ember/runloop';
import type { Span, Transaction } from '@sentry/types';
import { browserPerformanceTimeOrigin, GLOBAL_OBJ, timestampInSeconds } from '@sentry/utils';

import type { BrowserClient } from '..';
import { getActiveTransaction } from '..';
import type { EmberRouterMain, EmberSentryConfig, GlobalConfig, OwnConfig, StartTransactionFunction } from '../types';

type SentryTestRouterService = RouterService & {
  _startTransaction?: StartTransactionFunction;
  _sentryInstrumented?: boolean;
};

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
  startTransaction: StartTransactionFunction,
  startTransactionOnPageLoad?: boolean,
): {
  startTransaction: StartTransactionFunction;
} {
  const { disableRunloopPerformance } = config;
  const location = routerMain.location;
  let activeTransaction: Transaction | undefined;
  let transitionSpan: Span | undefined;

  const url = getLocationURL(location);

  if (macroCondition(isTesting())) {
    (routerService as SentryTestRouterService)._sentryInstrumented = true;
    (routerService as SentryTestRouterService)._startTransaction = startTransaction;
  }

  if (startTransactionOnPageLoad && url) {
    const routeInfo = routerService.recognize(url);
    activeTransaction = startTransaction({
      name: `route:${routeInfo.name}`,
      op: 'pageload',
      origin: 'auto.pageload.ember',
      tags: {
        url,
        toRoute: routeInfo.name,
        'routing.instrumentation': '@sentry/ember',
      },
    });
  }

  const finishActiveTransaction = (_: unknown, nextInstance: unknown): void => {
    if (nextInstance) {
      return;
    }
    activeTransaction?.finish();
    getBackburner().off('end', finishActiveTransaction);
  };

  routerService.on('routeWillChange', (transition: Transition) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);
    activeTransaction?.finish();
    activeTransaction = startTransaction({
      name: `route:${toRoute}`,
      op: 'navigation',
      origin: 'auto.navigation.ember',
      tags: {
        fromRoute,
        toRoute,
        'routing.instrumentation': '@sentry/ember',
      },
    });
    transitionSpan = activeTransaction?.startChild({
      op: 'ui.ember.transition',
      description: `route:${fromRoute} -> route:${toRoute}`,
      origin: 'auto.ui.ember',
    });
  });

  routerService.on('routeDidChange', () => {
    if (!transitionSpan || !activeTransaction) {
      return;
    }
    transitionSpan.finish();

    if (disableRunloopPerformance) {
      activeTransaction.finish();
      return;
    }

    getBackburner().on('end', finishActiveTransaction);
  });

  return {
    startTransaction,
  };
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
    const activeTransaction = getActiveTransaction();
    if (!activeTransaction) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.finish();
    }
    currentQueueStart = timestampInSeconds();

    const processQueue = (queue: EmberRunQueues): void => {
      // Process this queue using the end of the previous queue.
      if (currentQueueStart) {
        const now = timestampInSeconds();
        const minQueueDuration = minimumRunloopQueueDuration ?? 5;

        if ((now - currentQueueStart) * 1000 >= minQueueDuration) {
          activeTransaction
            ?.startChild({
              op: `ui.ember.runloop.${queue}`,
              origin: 'auto.ui.ember',
              startTimestamp: currentQueueStart,
              endTimestamp: now,
            })
            .finish();
        }
        currentQueueStart = undefined;
      }

      // Setup for next queue

      const stillActiveTransaction = getActiveTransaction();
      if (!stillActiveTransaction) {
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
      currentQueueSpan.finish();
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
    const activeTransaction = getActiveTransaction();

    activeTransaction?.startChild({
      op,
      description: payload.containerKey || payload.object,
      origin: 'auto.ui.ember',
      startTimestamp: begin.now,
      endTimestamp: now,
    });
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

  const startTimestamp = (measure.startTime + browserPerformanceTimeOrigin) / 1000;
  const endTimestamp = startTimestamp + measure.duration / 1000;

  const transaction = getActiveTransaction();
  const span = transaction?.startChild({
    op: 'ui.ember.init',
    origin: 'auto.ui.ember',
    startTimestamp,
  });
  span?.finish(endTimestamp);
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

  const { BrowserTracing } = await import('@sentry/browser');

  const idleTimeout = config.transitionTimeout || 5000;

  const browserTracing = new BrowserTracing({
    routingInstrumentation: (customStartTransaction, startTransactionOnPageLoad) => {
      // eslint-disable-next-line ember/no-private-routing-service
      const routerMain = appInstance.lookup('router:main') as EmberRouterMain;
      let routerService = appInstance.lookup('service:router') as
        | RouterService & { externalRouter?: RouterService; _hasMountedSentryPerformanceRouting?: boolean };

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
      _instrumentEmberRouter(routerService, routerMain, config, customStartTransaction, startTransactionOnPageLoad);
    },
    idleTimeout,
    ...browserTracingOptions,
  });

  if (macroCondition(isTesting())) {
    const client = Sentry.getCurrentHub().getClient();

    if (
      client &&
      (client as BrowserClient).getIntegrationById &&
      (client as BrowserClient).getIntegrationById('BrowserTracing')
    ) {
      // Initializers are called more than once in tests, causing the integrations to not be setup correctly.
      return;
    }
  }

  const client = Sentry.getCurrentHub().getClient();
  if (client && client.addIntegration) {
    client.addIntegration(browserTracing);
  }

  _instrumentEmberRunloop(config);
  _instrumentComponents(config);
  _instrumentInitialLoad(config);
}

export default {
  initialize,
};
