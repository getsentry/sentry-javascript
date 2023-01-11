import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import { arrayify, fill, isThenable, loadModule, logger } from '@sentry/utils';

import { shouldDisableAutoInstrumentation } from './utils/node-utils';

type ApolloResolverGroup = {
  [key: string]: () => unknown;
};

type ApolloModelResolvers = {
  [key: string]: ApolloResolverGroup;
};

/** Tracing integration for Apollo */
export class Apollo implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Apollo';

  /**
   * @inheritDoc
   */
  public name: string = Apollo.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (shouldDisableAutoInstrumentation(getCurrentHub)) {
      __DEBUG_BUILD__ && logger.log('Apollo Integration is skipped because of instrumenter configuration.');
      return;
    }

    const pkg = loadModule<{
      ApolloServerBase: {
        prototype: {
          constructSchema: () => unknown;
        };
      };
    }>('apollo-server-core');

    if (!pkg) {
      __DEBUG_BUILD__ && logger.error('Apollo Integration was unable to require apollo-server-core package.');
      return;
    }

    /**
     * Iterate over resolvers of the ApolloServer instance before schemas are constructed.
     */
    fill(pkg.ApolloServerBase.prototype, 'constructSchema', function (orig: () => unknown) {
      return function (this: { config: { resolvers?: ApolloModelResolvers[]; schema?: unknown; modules?: unknown } }) {
        if (!this.config.resolvers) {
          if (__DEBUG_BUILD__) {
            if (this.config.schema) {
              logger.warn(
                'Apollo integration is not able to trace `ApolloServer` instances constructed via `schema` property.',
              );
            } else if (this.config.modules) {
              logger.warn(
                'Apollo integration is not able to trace `ApolloServer` instances constructed via `modules` property.',
              );
            }

            logger.error('Skipping tracing as no resolvers found on the `ApolloServer` instance.');
          }

          return orig.call(this);
        }

        const resolvers = arrayify(this.config.resolvers);

        this.config.resolvers = resolvers.map(model => {
          Object.keys(model).forEach(resolverGroupName => {
            Object.keys(model[resolverGroupName]).forEach(resolverName => {
              if (typeof model[resolverGroupName][resolverName] !== 'function') {
                return;
              }

              wrapResolver(model, resolverGroupName, resolverName, getCurrentHub);
            });
          });

          return model;
        });

        return orig.call(this);
      };
    });
  }
}

/**
 * Wrap a single resolver which can be a parent of other resolvers and/or db operations.
 */
function wrapResolver(
  model: ApolloModelResolvers,
  resolverGroupName: string,
  resolverName: string,
  getCurrentHub: () => Hub,
): void {
  fill(model[resolverGroupName], resolverName, function (orig: () => unknown | Promise<unknown>) {
    return function (this: unknown, ...args: unknown[]) {
      const scope = getCurrentHub().getScope();
      const parentSpan = scope?.getSpan();
      const span = parentSpan?.startChild({
        description: `${resolverGroupName}.${resolverName}`,
        op: 'graphql.resolve',
      });

      const rv = orig.call(this, ...args);

      if (isThenable(rv)) {
        return rv.then((res: unknown) => {
          span?.finish();
          return res;
        });
      }

      span?.finish();

      return rv;
    };
  });
}
