import { Hub } from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from '../../flags';

interface PrismaClient {
  prototype: {
    query: () => void | Promise<unknown>;
  };
}

/** Tracing integration for @prisma/client package */
export class Prisma implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Prisma';

  /**
   * @inheritDoc
   */
  public name: string = Prisma.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const pkg = loadModule<{ PrismaClient: PrismaClient }>('@prisma/client');

    if (!pkg) {
      IS_DEBUG_BUILD && logger.error('Prisma integration was unable to require `@prisma/client` package.');
      return;
    }

    fill(pkg.PrismaClient.prototype, '_executeRequest', function (orig: () => void | Promise<unknown>) {
      return function (this: unknown, config: unknown) {
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();
        const span = parentSpan?.startChild({
          description: typeof config === 'string' ? config : (config as { clientMethod: string }).clientMethod,
          op: 'db',
        });

        const rv = orig.call(this, config);

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
}
