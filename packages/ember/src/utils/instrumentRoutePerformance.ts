import { startSpan } from '@sentry/browser';
import { CODE_FUNCTION_NAME, SENTRY_OP } from '@sentry/conventions/attributes';
import { GENERAL_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

import type Route from '@ember/routing/route';
import type { TransactionSource } from '@sentry/core';

type RouteConstructor = new (...args: ConstructorParameters<typeof Route>) => Route;

/**
 * Enables monitoring the performance of an Ember app.
 *
 * This wraps the route's lifecycle hooks (beforeModel, model, afterModel, setupController)
 * with Sentry spans to track their performance.
 *
 * @param BaseRoute - The Route class to instrument
 * @returns The instrumented Route class
 *
 * @example
 * ```ts
 * import Route from '@ember/routing/route';
 * import { instrumentRoutePerformance } from '@sentry/ember';
 *
 * class ApplicationRoute extends Route {
 *   async model() {
 *     return this.store.findAll('post');
 *   }
 * }
 *
 * export default instrumentRoutePerformance(ApplicationRoute);
 * ```
 */
export function instrumentRoutePerformance<T extends RouteConstructor>(BaseRoute: T): T {
  const instrumentFunction = async (
    hookName: string,
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Route hooks have varied signatures that can't be unified with unknown
    fn: (...args: any[]) => any,
    args: unknown[],
    source: TransactionSource,
  ): Promise<unknown> => {
    return startSpan(
      {
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
          [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
          [CODE_FUNCTION_NAME]: hookName,
        },
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
        return instrumentFunction('beforeModel', this.fullRouteName, super.beforeModel.bind(this), args, 'custom');
      }

      public async model(...args: unknown[]): Promise<unknown> {
        return instrumentFunction('model', this.fullRouteName, super.model.bind(this), args, 'custom');
      }

      public afterModel(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction('afterModel', this.fullRouteName, super.afterModel.bind(this), args, 'custom');
      }

      public setupController(...args: unknown[]): void | Promise<unknown> {
        return instrumentFunction(
          'setupController',
          this.fullRouteName,
          super.setupController.bind(this),
          args,
          'custom',
        );
      }
    },
  }[routeName] as T;
}
