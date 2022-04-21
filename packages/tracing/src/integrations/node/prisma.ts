import { Hub } from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { isThenable, logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from '../../flags';

type PrismaAction =
  | 'findUnique'
  | 'findMany'
  | 'findFirst'
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'upsert'
  | 'delete'
  | 'deleteMany'
  | 'executeRaw'
  | 'queryRaw'
  | 'aggregate'
  | 'count'
  | 'runCommandRaw';

interface PrismaMiddlewareParams {
  model?: unknown;
  action: PrismaAction;
  args: unknown;
  dataPath: string[];
  runInTransaction: boolean;
}

type PrismaMiddleware<T = unknown> = (
  params: PrismaMiddlewareParams,
  next: (params: PrismaMiddlewareParams) => Promise<T>,
) => Promise<T>;

interface PrismaClient {
  $use: (cb: PrismaMiddleware) => void;
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
   * Prisma ORM Client Instance
   */
  private readonly _client?: PrismaClient;

  /**
   * @inheritDoc
   */
  public constructor(options: { client?: PrismaClient } = {}) {
    this._client = options.client;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._client) {
      IS_DEBUG_BUILD && logger.error('PrismaIntegration is missing a Prisma Client Instance');
      return;
    }

    this._client.$use((params: PrismaMiddlewareParams, next: (params: PrismaMiddlewareParams) => Promise<unknown>) => {
      const scope = getCurrentHub().getScope();
      const parentSpan = scope?.getSpan();

      const action = params.action;
      const model = params.model;

      const span = parentSpan?.startChild({
        description: model ? `${model} ${action}` : action,
        op: 'db.prisma',
      });

      const rv = next(params);

      if (isThenable(rv)) {
        return rv.then((res: unknown) => {
          span?.finish();
          return res;
        });
      }

      span?.finish();
      return rv;
    });
  }
}
