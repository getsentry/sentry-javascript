import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import { isThenable, logger } from '@sentry/utils';

import { shouldDisableAutoInstrumentation } from './utils/node-utils';

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

function isValidPrismaClient(possibleClient: unknown): possibleClient is PrismaClient {
  return possibleClient && !!(possibleClient as PrismaClient)['$use'];
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
  public constructor(options: { client?: unknown } = {}) {
    if (isValidPrismaClient(options.client)) {
      this._client = options.client;
    } else {
      __DEBUG_BUILD__ &&
        logger.warn(
          `Unsupported Prisma client provided to PrismaIntegration. Provided client: ${JSON.stringify(options.client)}`,
        );
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._client) {
      __DEBUG_BUILD__ && logger.error('PrismaIntegration is missing a Prisma Client Instance');
      return;
    }

    if (shouldDisableAutoInstrumentation(getCurrentHub)) {
      __DEBUG_BUILD__ && logger.log('Prisma Integration is skipped because of instrumenter configuration.');
      return;
    }

    this._client.$use((params, next: (params: PrismaMiddlewareParams) => Promise<unknown>) => {
      const scope = getCurrentHub().getScope();
      const parentSpan = scope?.getSpan();

      const action = params.action;
      const model = params.model;

      const span = parentSpan?.startChild({
        description: model ? `${model} ${action}` : action,
        op: 'db.sql.prisma',
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
