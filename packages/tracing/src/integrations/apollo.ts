/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-debugger */
import { Hub } from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

type ApolloResolverGroup = {
  [key: string]: () => any;
};

type ApolloField = {
  [key: string]: ApolloResolverGroup;
};

/** Tracing integration for Apollo package */
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
    }>(`apollo-server-core`);

    debugger;
    if (!pkg) {
      logger.error(`Apollo Integration was unable to require apollo package.`);
      return;
    }

    fill(pkg.ApolloServerBase.prototype, 'constructSchema', function(orig: () => void) {
      return function(this: { config: { resolvers: ApolloField[] } }) {
        this.config.resolvers = this.config.resolvers.map(field => {
          Object.keys(field).forEach(resolverGroupName => {
            Object.keys(field[resolverGroupName]).forEach(resolverName => {
              if (typeof field[resolverGroupName][resolverName] !== 'function') {
                return;
              }

              patchResolver(field, resolverGroupName, resolverName, getCurrentHub);
            });
          });

          return field;
        });

        return orig.call(this);
      };
    });
  }
}

/**
 *
 * @param field
 * @param resolverGroupName
 * @param resolverName
 */
function patchResolver(
  field: ApolloField,
  resolverGroupName: string,
  resolverName: string,
  getCurrentHub: () => Hub,
): void {
  fill(field[resolverGroupName], resolverName, function(orig: () => unknown | Promise<unknown>) {
    return function(this: unknown, ...args: unknown[]) {
      const scope = getCurrentHub().getScope();
      const parentSpan = scope?.getSpan();
      const span = parentSpan?.startChild({
        description: `${resolverGroupName}.${resolverName}`,
        op: `apollo`,
      });

      scope?.setSpan(span);

      const rv = orig.call(this, ...args);

      if (isThenable(rv)) {
        return (rv as Promise<unknown>).then((res: unknown) => {
          span?.finish();
          scope?.setSpan(parentSpan);
          return res;
        });
      }

      span?.finish();
      scope?.setSpan(parentSpan);
      return rv;
    };
  });
}
