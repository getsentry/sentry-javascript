import * as Sentry from '@sentry/browser';
import { SDK_VERSION, BrowserOptions } from '@sentry/browser';
import { macroCondition, isDevelopingApp, getOwnConfig } from '@embroider/macros';
import { next } from '@ember/runloop';
import { assert, warn } from '@ember/debug';
import Ember from 'ember';
import { timestampWithMs } from '@sentry/utils';
import { GlobalConfig, OwnConfig } from './types';
import { getGlobalObject } from '@sentry/utils';

declare module '@ember/debug' {
  export function assert(desc: string, test: unknown): void;
}

function _getSentryInitConfig() {
  const _global = getGlobalObject<GlobalConfig>();
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  return _global.__sentryEmberConfig;
}

export function InitSentryForEmber(_runtimeConfig?: BrowserOptions) {
  const environmentConfig = getOwnConfig<OwnConfig>().sentryConfig;

  assert('Missing configuration.', environmentConfig);
  assert('Missing configuration for Sentry.', environmentConfig.sentry || _runtimeConfig);

  if (!environmentConfig.sentry) {
    // If environment config is not specified but the above assertion passes, use runtime config.
    environmentConfig.sentry = { ..._runtimeConfig } as any;
  }

  // Merge runtime config into environment config, preferring runtime.
  Object.assign(environmentConfig.sentry, _runtimeConfig || {});
  const initConfig = Object.assign({}, environmentConfig.sentry);

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

  // Persist Sentry init options so they are identical when performance initializers call init again.
  const sentryInitConfig = _getSentryInitConfig();
  Object.assign(sentryInitConfig, initConfig);

  Sentry.init(initConfig);

  if (macroCondition(isDevelopingApp())) {
    if (environmentConfig.ignoreEmberOnErrorWarning) {
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
        return instrumentFunction(
          'ember.route.beforeModel',
          (<any>this).fullRouteName,
          super.beforeModel.bind(this),
          args,
        );
      }

      async model(...args: any[]) {
        return instrumentFunction('ember.route.model', (<any>this).fullRouteName, super.model.bind(this), args);
      }

      async afterModel(...args: any[]) {
        return instrumentFunction(
          'ember.route.afterModel',
          (<any>this).fullRouteName,
          super.afterModel.bind(this),
          args,
        );
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

// init is now the preferred way to call initialization for this addon.
export const init = InitSentryForEmber;
