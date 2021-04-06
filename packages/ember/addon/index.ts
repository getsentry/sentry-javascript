import * as Sentry from '@sentry/browser';
import { SDK_VERSION, BrowserOptions } from '@sentry/browser';
import { macroCondition, isDevelopingApp, getOwnConfig } from '@embroider/macros';
import { next } from '@ember/runloop';
import { assert, warn } from '@ember/debug';
import Ember from 'ember';
import { timestampWithMs } from '@sentry/utils';
import { OwnConfig } from './types';

declare module '@ember/debug' {
  export function assert(desc: string, test: unknown): void;
}

export function InitSentryForEmber(_runtimeConfig: BrowserOptions | undefined) {
  const config = getOwnConfig<OwnConfig>().sentryConfig;

  assert('Missing configuration.', config);
  assert('Missing configuration for Sentry.', config.sentry || _runtimeConfig);

  const initConfig = Object.assign({}, config.sentry, _runtimeConfig || {});

  initConfig._metadata = initConfig._metadata || {};
  initConfig._metadata.sdk = {
    name: 'sentry.javascript.ember',
    packages: [
      {
        name: 'npm:@sentry/ember',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  Sentry.init(initConfig);

  if (macroCondition(isDevelopingApp())) {
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
  }
}

export const getActiveTransaction = () => {
  return Sentry.getCurrentHub()
    ?.getScope()
    ?.getTransaction();
};

export const instrumentRoutePerformance = (BaseRoute: any) => {
  const instrumentFunction = async (op: string, description: string, fn: Function, args: any) => {
    const startTimestamp = timestampWithMs();
    const result = await fn(...args);

    const currentTransaction = getActiveTransaction();
    if (!currentTransaction) {
      return result;
    }
    currentTransaction.startChild({ op, description, startTimestamp }).finish();
    return result;
  };

  return {
    [BaseRoute.name]: class extends BaseRoute {
      beforeModel(...args: any[]) {
        return instrumentFunction('ember.route.beforeModel', (<any>this).fullRouteName, super.beforeModel.bind(this), args);
      }

      async model(...args: any[]) {
        return instrumentFunction('ember.route.model', (<any>this).fullRouteName, super.model.bind(this), args);
      }

      async afterModel(...args: any[]) {
        return instrumentFunction('ember.route.afterModel', (<any>this).fullRouteName, super.afterModel.bind(this), args);
      }

      async setupController(...args: any[]) {
        return instrumentFunction(
          'ember.route.setupController',
          (<any>this).fullRouteName,
          super.setupController.bind(this),
          args,
        );
      }
    },
  }[BaseRoute.name];
};

export * from '@sentry/browser';
