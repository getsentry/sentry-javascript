import { Hub } from '@sentry/core';
import { EventProcessor, Integration } from '@sentry/types';
import { arrayify, fill, isThenable, loadModule, logger } from '@sentry/utils';

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
    const pkg = loadModule<{
      ApolloServerBase: {
        prototype: {
          constructSchema: () => unknown;
        };
      };
    }>('apollo-server-core');

    if (!pkg) {
      logger.error('Apollo Integration was unable to require apollo-server-core package.');
      return;
    }

    /**
     * Iterate over resolvers of the ApolloServer instance before schemas are constructed.
     */
    fill(pkg.ApolloServerBase.prototype, 'constructSchema', function (orig: () => unknown) {
      return function (this: { config: { resolvers: ApolloModelResolvers[] } }) {
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
        op: 'db.graphql.apollo',
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
