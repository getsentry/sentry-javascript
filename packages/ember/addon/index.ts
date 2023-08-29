import { assert, warn } from '@ember/debug';
import type Route from '@ember/routing/route';
import { next } from '@ember/runloop';
import { getOwnConfig, isDevelopingApp, macroCondition } from '@embroider/macros';
import type { BrowserOptions } from '@sentry/browser';
import * as Sentry from '@sentry/browser';
import { SDK_VERSION } from '@sentry/browser';
import type { Transaction } from '@sentry/types';
import { GLOBAL_OBJ, timestampInSeconds } from '@sentry/utils';
import Ember from 'ember';

import type { EmberSentryConfig, GlobalConfig, OwnConfig } from './types';

function _getSentryInitConfig(): EmberSentryConfig['sentry'] {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  return _global.__sentryEmberConfig;
}

export function InitSentryForEmber(_runtimeConfig?: BrowserOptions): void {
  const environmentConfig = getOwnConfig<OwnConfig>().sentryConfig;

  assert('Missing configuration.', environmentConfig);
  assert('Missing configuration for Sentry.', environmentConfig.sentry || _runtimeConfig);

  if (!environmentConfig.sentry) {
    // If environment config is not specified but the above assertion passes, use runtime config.
    environmentConfig.sentry = { ..._runtimeConfig };
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
    next(null, function () {
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

export const getActiveTransaction = (): Transaction | undefined => {
  return Sentry.getCurrentHub().getScope().getTransaction();
};

type RouteConstructor = new (...args: ConstructorParameters<typeof Route>) => Route;

export const instrumentRoutePerformance = <T extends RouteConstructor>(BaseRoute: T): T => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instrumentFunction = async <X extends (...args: unknown[]) => any>(
    op: string,
    description: string,
    fn: X,
    args: Parameters<X>,
  ): Promise<ReturnType<X>> => {
    const startTimestamp = timestampInSeconds();
    const result = await fn(...args);

    const currentTransaction = getActiveTransaction();
    if (!currentTransaction) {
      return result;
    }
    currentTransaction
      .startChild({
        op,
        description,
        origin: 'auto.ui.ember',
        startTimestamp,
      })
      .finish();
    return result;
  };

  const routeName = BaseRoute.name;

  return {
    // @ts-expect-error TS2545 We do not need to redefine a constructor here
    [routeName]: class extends BaseRoute {
      public beforeModel(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction(
          'ui.ember.route.before_model',
          this.fullRouteName,
          super.beforeModel.bind(this),
          args,
        );
      }

      public async model(...args: unknown[]): Promise<unknown> {
        return instrumentFunction('ui.ember.route.model', this.fullRouteName, super.model.bind(this), args);
      }

      public afterModel(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction('ui.ember.route.after_model', this.fullRouteName, super.afterModel.bind(this), args);
      }

      public setupController(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction(
          'ui.ember.route.setup_controller',
          this.fullRouteName,
          super.setupController.bind(this),
          args,
        );
      }
    },
  }[routeName] as T;
};

export * from '@sentry/browser';

// init is now the preferred way to call initialization for this addon.
export const init = InitSentryForEmber;
