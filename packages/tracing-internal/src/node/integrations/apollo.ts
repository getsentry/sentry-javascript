import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { arrayify, fill, loadModule, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../../common/debug-build';
import type { LazyLoadedIntegration } from './lazy';

interface ApolloOptions {
  useNestjs?: boolean;
}

type ApolloResolverGroup = {
  [key: string]: () => unknown;
};

type ApolloModelResolvers = {
  [key: string]: ApolloResolverGroup;
};

type GraphQLModule = {
  GraphQLFactory: {
    prototype: {
      create: (resolvers: ApolloModelResolvers[]) => unknown;
    };
  };
};

type ApolloModule = {
  ApolloServerBase: {
    prototype: {
      constructSchema: (config: unknown) => unknown;
    };
  };
};

/** Tracing integration for Apollo */
export class Apollo implements LazyLoadedIntegration<GraphQLModule & ApolloModule> {
  /**
   * @inheritDoc
   */
  public static id: string = 'Apollo';

  /**
   * @inheritDoc
   */
  public name: string;

  private readonly _useNest: boolean;

  private _module?: GraphQLModule & ApolloModule;

  /**
   * @inheritDoc
   */
  public constructor(
    options: ApolloOptions = {
      useNestjs: false,
    },
  ) {
    this.name = Apollo.id;
    this._useNest = !!options.useNestjs;
  }

  /** @inheritdoc */
  public loadDependency(): (GraphQLModule & ApolloModule) | undefined {
    if (this._useNest) {
      this._module = this._module || loadModule('@nestjs/graphql');
    } else {
      this._module = this._module || loadModule('apollo-server-core');
    }

    return this._module;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    if (this._useNest) {
      const pkg = this.loadDependency();

      if (!pkg) {
        DEBUG_BUILD && logger.error('Apollo-NestJS Integration was unable to require @nestjs/graphql package.');
        return;
      }

      /**
       * Iterate over resolvers of NestJS ResolversExplorerService before schemas are constructed.
       */
      fill(
        pkg.GraphQLFactory.prototype,
        'mergeWithSchema',
        function (orig: (this: unknown, ...args: unknown[]) => unknown) {
          return function (
            this: { resolversExplorerService: { explore: () => ApolloModelResolvers[] } },
            ...args: unknown[]
          ) {
            fill(this.resolversExplorerService, 'explore', function (orig: () => ApolloModelResolvers[]) {
              return function (this: unknown) {
                const resolvers = arrayify(orig.call(this));

                const instrumentedResolvers = instrumentResolvers(resolvers);

                return instrumentedResolvers;
              };
            });

            return orig.call(this, ...args);
          };
        },
      );
    } else {
      const pkg = this.loadDependency();

      if (!pkg) {
        DEBUG_BUILD && logger.error('Apollo Integration was unable to require apollo-server-core package.');
        return;
      }

      /**
       * Iterate over resolvers of the ApolloServer instance before schemas are constructed.
       */
      fill(pkg.ApolloServerBase.prototype, 'constructSchema', function (orig: (config: unknown) => unknown) {
        return function (this: {
          config: { resolvers?: ApolloModelResolvers[]; schema?: unknown; modules?: unknown };
        }) {
          if (!this.config.resolvers) {
            if (DEBUG_BUILD) {
              if (this.config.schema) {
                logger.warn(
                  'Apollo integration is not able to trace `ApolloServer` instances constructed via `schema` property.' +
                    'If you are using NestJS with Apollo, please use `Sentry.Integrations.Apollo({ useNestjs: true })` instead.',
                );
                logger.warn();
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

          this.config.resolvers = instrumentResolvers(resolvers);

          return orig.call(this);
        };
      });
    }
  }
}

function instrumentResolvers(resolvers: ApolloModelResolvers[]): ApolloModelResolvers[] {
  return resolvers.map(model => {
    Object.keys(model).forEach(resolverGroupName => {
      Object.keys(model[resolverGroupName]).forEach(resolverName => {
        if (typeof model[resolverGroupName][resolverName] !== 'function') {
          return;
        }

        wrapResolver(model, resolverGroupName, resolverName);
      });
    });

    return model;
  });
}

/**
 * Wrap a single resolver which can be a parent of other resolvers and/or db operations.
 */
function wrapResolver(model: ApolloModelResolvers, resolverGroupName: string, resolverName: string): void {
  fill(model[resolverGroupName], resolverName, function (orig: () => unknown | Promise<unknown>) {
    return function (this: unknown, ...args: unknown[]) {
      return startSpan(
        {
          onlyIfParent: true,
          name: `${resolverGroupName}.${resolverName}`,
          op: 'graphql.resolve',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.graphql.apollo',
          },
        },
        () => {
          return orig.call(this, ...args);
        },
      );
    };
  });
}
