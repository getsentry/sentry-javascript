import * as Sentry from '@sentry/browser';
import { addGlobalEventProcessor, SDK_VERSION, BrowserOptions } from '@sentry/browser';
import environmentConfig from 'ember-get-config';

import { next } from '@ember/runloop';
import { assert, warn, runInDebug } from '@ember/debug';
import Ember from 'ember';

declare module '@ember/debug' {
  export function assert(desc: string, test: unknown): void;
}

export function InitSentryForEmber(_runtimeConfig: BrowserOptions | undefined) {
  const config = environmentConfig['@sentry/ember'];
  assert('Missing configuration', config);
  assert('Missing configuration for Sentry.', config.sentry);

  const initConfig = Object.assign({}, config.sentry, _runtimeConfig || {});

  createEmberEventProcessor();

  Sentry.init(initConfig);

  runInDebug(() => {
    if (config.ignoreEmberOnErrorWarning) {
      return;
    }
    next(null, function() {
      warn(
        'Ember.onerror found. Using Ember.onerror can hide some errors (such as flushed runloop errors) from Sentry. Use Sentry.captureException to capture errors within Ember.onError or remove it to have errors caught by Sentry directly. This error can be silenced via addon configuration.',
        !Ember.onerror,
        {
          id: '@sentry/ember.ember-onerror-detected',
        },
      );
    });
  });
}

const getCurrentTransaction = () => {
  return Sentry.getCurrentHub()
    ?.getScope()
    ?.getTransaction();
};

const instrumentFunction = async (op: string, description: string, fn: Function, args: any) => {
  const currentTransaction = getCurrentTransaction();
  const span = currentTransaction?.startChild({ op, description });
  const result = await fn(...args);
  span?.finish();
  return result;
};

export const instrumentRoutePerformance = (BaseRoute: any) => {
  return class InstrumentedRoute extends BaseRoute {
    beforeModel(...args: any[]) {
      return instrumentFunction('ember.route.beforeModel', (<any>this).fullRouteName, super.beforeModel, args);
    }

    async model(...args: any[]) {
      return instrumentFunction('ember.route.model', (<any>this).fullRouteName, super.model, args);
    }

    async afterModel(...args: any[]) {
      return instrumentFunction('ember.route.afterModel', (<any>this).fullRouteName, super.afterModel, args);
    }

    async setupController(...args: any[]) {
      return instrumentFunction('ember.route.setupController', (<any>this).fullRouteName, super.setupController, args);
    }
  };
};

function createEmberEventProcessor(): void {
  if (addGlobalEventProcessor) {
    addGlobalEventProcessor(event => {
      event.sdk = {
        ...event.sdk,
        name: 'sentry.javascript.ember',
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          {
            name: 'npm:@sentry/ember',
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      };

      return event;
    });
  }
}

export * from '@sentry/browser';
