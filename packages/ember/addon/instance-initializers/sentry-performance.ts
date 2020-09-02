import ApplicationInstance from '@ember/application/instance';
import Ember from 'ember';
import { scheduleOnce } from '@ember/runloop';
import environmentConfig from 'ember-get-config';
import Sentry from '@sentry/ember';
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
        const location = appInstance.lookup('router:main').location;
        const router = appInstance.lookup('service:router');
        let activeTransaction: any;
        let transitionSpan: any;
        const url = location && location.getURL && location.getURL();
        if (startTransactionOnPageLoad && url) {
          const routeInfo = router.recognize(url);
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

        router.on('routeWillChange', (transition: any) => {
          const { fromRoute, toRoute } = getTransitionInformation(transition, router);
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
        router.on('routeDidChange', (transition: any) => {
          const { toRoute } = getTransitionInformation(transition, router);
          let renderSpan: any;
          if (!transitionSpan || !activeTransaction) {
            return;
          }
          transitionSpan.finish();

          function startRenderSpan() {
            renderSpan = activeTransaction.startChild({
              op: 'ember.runloop.render',
              description: `Post transition render for route:${toRoute}`,
            });
          }

          function finishRenderSpan() {
            renderSpan.finish();
            activeTransaction.finish();
          }

          scheduleOnce('routerTransitions', null, startRenderSpan);
          scheduleOnce('afterRender', null, finishRenderSpan);
        });
      },
      idleTimeout,
    }),
  ];

  Sentry.init(sentryConfig); // Call init again to rebind client with new integration list in addition to the defaults
}

export default {
  initialize,
};
