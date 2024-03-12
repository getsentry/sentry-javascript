import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { fill, loadModule, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../../common/debug-build';
import type { LazyLoadedIntegration } from './lazy';

type GraphQLModule = {
  [method: string]: (...args: unknown[]) => unknown;
};

/** Tracing integration for graphql package */
export class GraphQL implements LazyLoadedIntegration<GraphQLModule> {
  /**
   * @inheritDoc
   */
  public static id: string = 'GraphQL';

  /**
   * @inheritDoc
   */
  public name: string;

  private _module?: GraphQLModule;

  public constructor() {
    this.name = GraphQL.id;
  }

  /** @inheritdoc */
  public loadDependency(): GraphQLModule | undefined {
    return (this._module = this._module || loadModule('graphql/execution/execute.js'));
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const pkg = this.loadDependency();

    if (!pkg) {
      DEBUG_BUILD && logger.error('GraphQL Integration was unable to require graphql/execution package.');
      return;
    }

    fill(pkg, 'execute', function (orig: () => void | Promise<unknown>) {
      return function (this: unknown, ...args: unknown[]) {
        return startSpan(
          {
            onlyIfParent: true,
            name: 'execute',
            op: 'graphql.execute',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.graphql.graphql',
            },
          },
          () => {
            return orig.call(this, ...args);
          },
        );
      };
    });
  }
}
