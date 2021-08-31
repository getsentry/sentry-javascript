/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-debugger */
import { Hub } from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

/** Tracing integration for graphql package */
export class GraphQL implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GraphQL';

  /**
   * @inheritDoc
   */
  public name: string = GraphQL.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const pkg = loadModule<{
      [method: string]: (...args: unknown[]) => unknown;
    }>(`graphql/execution/execute.js`);

    debugger;
    if (!pkg) {
      logger.error(`GraphQL Integration was unable to require @graphql/execution package.`);
      return;
    }

    ['execute', 'defaultFieldResolver', 'defaultTypeResolver', 'buildExecutionContext'].forEach(method => {
      fill(pkg, method, function(orig: () => void | Promise<unknown>) {
        return function(this: unknown, ...args: unknown[]) {
          const scope = getCurrentHub().getScope();
          const parentSpan = scope?.getSpan();

          const span = parentSpan?.startChild({
            description: method,
            op: 'graphql',
          });

          const rv = orig.call(this, ...args) as Promise<unknown>;

          if (isThenable(rv)) {
            return rv.then((res: unknown) => {
              span?.finish();
              return res;
            });
          } else {
            span?.finish();
            return rv;
          }
        };
      });
    });
  }
}
