import ApplicationInstance from '@ember/application/instance';
import Ember from 'ember';
import { run } from '@ember/runloop';
import * as Sentry from '@sentry/browser';
import { Span, Transaction, Integration } from '@sentry/types';
import { EmberRunQueues } from '@ember/runloop/-private/types';
import { getActiveTransaction } from '..';
import { timestampWithMs } from '@sentry/utils';
import { macroCondition, isTesting, getOwnConfig } from '@embroider/macros';
import { EmberSentryConfig, OwnConfig } from '../types';

function getSentryConfig() {
  return getOwnConfig<OwnConfig>().sentryConfig;
}

export function initialize(appInstance: ApplicationInstance): void {
  const config = getSentryConfig();
  if (config['disablePerformance']) {
    return;
  }
  const performancePromise = instrumentForPerformance(appInstance);
  if (macroCondition(isTesting())) {
    (<any>window)._sentryPerformanceLoad = performancePromise;
  }
}

function getTransitionInformation(transition: any, router: any): { [key: string]: any } {
  const fromRoute = transition?.from?.name;
  const toRoute = transition && transition.to ? transition.to.name : router.currentRouteName;
  return {
    fromRoute,
    toRoute,
  };
}

function getLocationURL(location: any) {
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
  routerService: any,
  routerMain: any,
  config: EmberSentryConfig,
  startTransaction: Function,
  startTransactionOnPageLoad?: boolean,
) {
  const { disableRunloopPerformance } = config;
  const location = routerMain.location;
  let activeTransaction: Transaction;
  let transitionSpan: Span;

  const url = getLocationURL(location);

  if (macroCondition(isTesting())) {
    routerService._sentryInstrumented = true;
    routerService._startTransaction = startTransaction;
  }

  if (startTransactionOnPageLoad && url) {
    const routeInfo = routerService.recognize(url);
    activeTransaction = startTransaction({
      name: `route:${routeInfo.name}`,
      op: 'pageload',
      tags: {
        url,
        toRoute: routeInfo.name,
        'routing.instrumentation': '@sentry/ember',
      },
    });
  }

  const finishActiveTransaction = function(_: any, nextInstance: any) {
    if (nextInstance) {
      return;
    }
    activeTransaction.finish();
    run.backburner.off('end', finishActiveTransaction);
  };

  routerService.on('routeWillChange', (transition: any) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);
    activeTransaction?.finish();
    activeTransaction = startTransaction({
      name: `route:${toRoute}`,
      op: 'navigation',
      tags: {
        fromRoute,
        toRoute,
        'routing.instrumentation': '@sentry/ember',
      },
    });
    transitionSpan = activeTransaction.startChild({
      op: 'ember.transition',
      description: `route:${fromRoute} -> route:${toRoute}`,
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

    run.backburner.on('end', finishActiveTransaction);
  });

  return {
    startTransaction,
  };
}

function _instrumentEmberRunloop(config: EmberSentryConfig) {
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

  run.backburner.on('begin', (_: any, previousInstance: any) => {
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
    currentQueueStart = timestampWithMs();

    instrumentedEmberQueues.forEach(queue => {
      run.scheduleOnce(queue, null, () => {
        run.scheduleOnce(queue, null, () => {
          // Process this queue using the end of the previous queue.
          if (currentQueueStart) {
            const now = timestampWithMs();
            const minQueueDuration = minimumRunloopQueueDuration ?? 5;

            if ((now - currentQueueStart) * 1000 >= minQueueDuration) {
              activeTransaction
                ?.startChild({
                  op: `ember.runloop.${queue}`,
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
          currentQueueStart = timestampWithMs();
        });
      });
    });
  });
  run.backburner.on('end', (_: any, nextInstance: any) => {
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

function processComponentRenderBefore(payload: Payload, beforeEntries: RenderEntries) {
  const info = {
    payload,
    now: timestampWithMs(),
  };
  beforeEntries[payload.object] = info;
}

function processComponentRenderAfter(
  payload: Payload,
  beforeEntries: RenderEntries,
  op: string,
  minComponentDuration: number,
) {
  const begin = beforeEntries[payload.object];

  if (!begin) {
    return;
  }

  const now = timestampWithMs();
  const componentRenderDuration = now - begin.now;

  if (componentRenderDuration * 1000 >= minComponentDuration) {
    const activeTransaction = getActiveTransaction();

    activeTransaction?.startChild({
      op,
      description: payload.containerKey || payload.object,
      startTimestamp: begin.now,
      endTimestamp: now,
    });
  }
}

function _instrumentComponents(config: EmberSentryConfig) {
  const { disableInstrumentComponents, minimumComponentRenderDuration, enableComponentDefinitions } = config;
  if (disableInstrumentComponents) {
    return;
  }

  const minComponentDuration = minimumComponentRenderDuration ?? 2;

  const beforeEntries = {} as RenderEntries;
  const beforeComponentDefinitionEntries = {} as RenderEntries;

  const subscribe = Ember.subscribe;
  function _subscribeToRenderEvents() {
    subscribe('render.component', {
      before(_name: string, _timestamp: number, payload: Payload) {
        processComponentRenderBefore(payload, beforeEntries);
      },

      after(_name: string, _timestamp: number, payload: any, _beganIndex: number) {
        processComponentRenderAfter(payload, beforeEntries, 'ember.component.render', minComponentDuration);
      },
    });
    if (enableComponentDefinitions) {
      subscribe('render.getComponentDefinition', {
        before(_name: string, _timestamp: number, payload: Payload) {
          processComponentRenderBefore(payload, beforeComponentDefinitionEntries);
        },

        after(_name: string, _timestamp: number, payload: any, _beganIndex: number) {
          processComponentRenderAfter(payload, beforeComponentDefinitionEntries, 'ember.component.definition', 0);
        },
      });
    }
  }
  _subscribeToRenderEvents();
}

function _instrumentInitialLoad(config: EmberSentryConfig) {
  const startName = '@sentry/ember:initial-load-start';
  const endName = '@sentry/ember:initial-load-end';

  const { performance } = window;
  const HAS_PERFORMANCE = performance && performance.clearMarks && performance.clearMeasures;

  if (!HAS_PERFORMANCE) {
    return;
  }

  if (config.disableInitialLoadInstrumentation) {
    performance.clearMarks(startName);
    performance.clearMarks(endName);
    return;
  }

  // Split performance check in two so clearMarks still happens even if timeOrigin isn't available.
  const HAS_PERFORMANCE_TIMING =
    performance.measure && performance.getEntriesByName && performance.timeOrigin !== undefined;
  if (!HAS_PERFORMANCE_TIMING) {
    return;
  }
  const measureName = '@sentry/ember:initial-load';

  performance.measure(measureName, startName, endName);
  const measures = performance.getEntriesByName(measureName);
  const measure = measures[0];

  const startTimestamp = (measure.startTime + performance.timeOrigin) / 1000;
  const endTimestamp = startTimestamp + measure.duration / 1000;

  const transaction = getActiveTransaction();
  const span = transaction?.startChild({
    op: 'ember.initial-load',
    startTimestamp,
  });
  span?.finish(endTimestamp);
  performance.clearMarks(startName);
  performance.clearMarks(endName);

  performance.clearMeasures(measureName);
}

export async function instrumentForPerformance(appInstance: ApplicationInstance) {
  const config = getSentryConfig();
  const sentryConfig = config.sentry;

  const tracing = await import('@sentry/tracing');

  const idleTimeout = config.transitionTimeout || 5000;

  const existingIntegrations = (sentryConfig['integrations'] || []) as Integration[];

  sentryConfig['integrations'] = [
    ...existingIntegrations,
    new tracing.Integrations.BrowserTracing({
      routingInstrumentation: (startTransaction, startTransactionOnPageLoad) => {
        const routerMain = appInstance.lookup('router:main');
        const routerService = appInstance.lookup('service:router');
        _instrumentEmberRouter(routerService, routerMain, config, startTransaction, startTransactionOnPageLoad);
      },
      idleTimeout,
    }),
  ];

  if (isTesting() && Sentry.getCurrentHub()?.getIntegration(tracing.Integrations.BrowserTracing)) {
    // Initializers are called more than once in tests, causing the integrations to not be setup correctly.
    return;
  }

  Sentry.init(sentryConfig); // Call init again to rebind client with new integration list in addition to the defaults

  _instrumentEmberRunloop(config);
  _instrumentComponents(config);
  _instrumentInitialLoad(config);
}

export default {
  initialize,
};
