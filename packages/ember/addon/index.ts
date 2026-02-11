// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import { assert } from '@ember/debug';
import type Route from '@ember/routing/route';
import { getOwnConfig } from '@embroider/macros';
import type { BrowserOptions } from '@sentry/browser';
import { startSpan } from '@sentry/browser';
import * as Sentry from '@sentry/browser';
import type { Client, TransactionSource } from '@sentry/core';
import {
  applySdkMetadata,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import type { EmberSentryConfig, GlobalConfig, OwnConfig } from './types';

function _getSentryInitConfig(): EmberSentryConfig['sentry'] {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  return _global.__sentryEmberConfig;
}

/**
 * Initialize the Sentry SDK for Ember.
 */
export function init(_runtimeConfig?: BrowserOptions): Client | undefined {
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

  return Sentry.init(initConfig);
}

type RouteConstructor = new (...args: ConstructorParameters<typeof Route>) => Route;

export const instrumentRoutePerformance = <T extends RouteConstructor>(BaseRoute: T): T => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instrumentFunction = async <X extends (...args: unknown[]) => any>(
    op: string,
    name: string,
    fn: X,
    args: Parameters<X>,
    source: TransactionSource,
  ): Promise<ReturnType<X>> => {
    return startSpan(
      {
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
        },
        op,
        name,
        onlyIfParent: true,
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
          'custom',
        );
      }

      public async model(...args: unknown[]): Promise<unknown> {
        return instrumentFunction('ui.ember.route.model', this.fullRouteName, super.model.bind(this), args, 'custom');
      }

      public afterModel(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction(
          'ui.ember.route.after_model',
          this.fullRouteName,
          super.afterModel.bind(this),
          args,
          'custom',
        );
      }

      public setupController(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction(
          'ui.ember.route.setup_controller',
          this.fullRouteName,
          super.setupController.bind(this),
          args,
          'custom',
        );
      }
    },
  }[routeName] as T;
};

export * from '@sentry/browser';
