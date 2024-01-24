import { assert, warn } from '@ember/debug';
import type Route from '@ember/routing/route';
import { next } from '@ember/runloop';
import { getOwnConfig, isDevelopingApp, macroCondition } from '@embroider/macros';
import { startSpan } from '@sentry/browser';
import type { BrowserOptions } from '@sentry/browser';
import * as Sentry from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/utils';
import Ember from 'ember';

import type { Transaction } from '@sentry/types';
import type { EmberSentryConfig, GlobalConfig, OwnConfig } from './types';

function _getSentryInitConfig(): EmberSentryConfig['sentry'] {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  return _global.__sentryEmberConfig;
}

/**
 * Initialize the Sentry SDK for Ember.
 */
export function init(_runtimeConfig?: BrowserOptions): void {
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

  applySdkMetadata(initConfig, 'ember');

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

/**
 * Grabs active transaction off scope.
 *
 * @deprecated You should not rely on the transaction, but just use `startSpan()` APIs instead.
 */
export const getActiveTransaction = (): Transaction | undefined => {
  // eslint-disable-next-line deprecation/deprecation
  return Sentry.getCurrentScope().getTransaction();
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
    return startSpan(
      {
        op,
        name: description,
        origin: 'auto.ui.ember',
      },
      () => {
        return fn(...args);
      },
    );
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

/**
 * @deprecated Use `Sentry.init()` instead.
 */
export const InitSentryForEmber = init;
