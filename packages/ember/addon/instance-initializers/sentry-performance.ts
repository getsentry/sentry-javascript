import ApplicationInstance from '@ember/application/instance';
import Ember from 'ember';
import { scheduleOnce } from '@ember/runloop';
import environmentConfig from 'ember-get-config';
import Sentry from '@sentry/browser';
import { Integration } from '@sentry/types';

export function initialize(appInstance: ApplicationInstance): void {
  const config = environmentConfig['@sentry/ember'];
  if (config['disablePerformance']) {
    return;
  }
  const performancePromise = instrumentForPerformance(appInstance);
  if (Ember.testing) {
    (<any>window)._sentryPerformanceLoad = performancePromise;
  }
}

function getTransitionInformation(transition: any, router: any) {
  const fromRoute = transition?.from?.name;
  const toRoute = transition ? transition.to.name : router.currentRouteName;
  return {
    fromRoute,
    toRoute,
  };
}

export function _instrumentEmberRouter(
  routerService: any,
  routerMain: any,
  config: typeof environmentConfig['@sentry/ember'],
  startTransaction: Function,
  startTransactionOnPageLoad?: boolean,
) {
  const { disablePostTransitionRender } = config;
  const location = routerMain.location;
  let activeTransaction: any;
  let transitionSpan: any;

  const url = location && location.getURL && location.getURL();

  if (Ember.testing) {
    routerService._sentryInstrumented = true;
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

  routerService.on('routeWillChange', (transition: any) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);
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

  routerService.on('routeDidChange', (transition: any) => {
    const { toRoute } = getTransitionInformation(transition, routerService);
    let renderSpan: any;
    if (!transitionSpan || !activeTransaction) {
      return;
    }
    transitionSpan.finish();

    if (disablePostTransitionRender) {
      activeTransaction.finish();
    }

    function startRenderSpan() {
      renderSpan = activeTransaction.startChild({
        op: 'ember.runloop.render',
        description: `post-transition render route:${toRoute}`,
      });
    }

    function finishRenderSpan() {
      renderSpan.finish();
      activeTransaction.finish();
    }

    scheduleOnce('routerTransitions', null, startRenderSpan);
    scheduleOnce('afterRender', null, finishRenderSpan);
  });
}

export async function instrumentForPerformance(appInstance: ApplicationInstance) {
  const config = environmentConfig['@sentry/ember'];
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

  Sentry.init(sentryConfig); // Call init again to rebind client with new integration list in addition to the defaults
}

export default {
  initialize,
};
