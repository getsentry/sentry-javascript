import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { addNonEnumerableProperty, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../../common/debug-build';

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
  _sentryInstrumented?: boolean;
  _engineConfig?: {
    activeProvider?: string;
    clientVersion?: string;
  };
  $use: (cb: PrismaMiddleware) => void;
}

function isValidPrismaClient(possibleClient: unknown): possibleClient is PrismaClient {
  return !!possibleClient && !!(possibleClient as PrismaClient)['$use'];
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
  public name: string;

  /**
   * @inheritDoc
   */
  public constructor(options: { client?: unknown } = {}) {
    this.name = Prisma.id;

    // We instrument the PrismaClient inside the constructor and not inside `setupOnce` because in some cases of server-side
    // bundling (Next.js) multiple Prisma clients can be instantiated, even though users don't intend to. When instrumenting
    // in setupOnce we can only ever instrument one client.
    // https://github.com/getsentry/sentry-javascript/issues/7216#issuecomment-1602375012
    // In the future we might explore providing a dedicated PrismaClient middleware instead of this hack.
    if (isValidPrismaClient(options.client) && !options.client._sentryInstrumented) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addNonEnumerableProperty(options.client as any, '_sentryInstrumented', true);

      const clientData: Record<string, string | number> = {};
      try {
        const engineConfig = (options.client as PrismaClient)._engineConfig;
        if (engineConfig) {
          const { activeProvider, clientVersion } = engineConfig;
          if (activeProvider) {
            clientData['db.system'] = activeProvider;
          }
          if (clientVersion) {
            clientData['db.prisma.version'] = clientVersion;
          }
        }
      } catch (e) {
        // ignore
      }

      options.client.$use((params, next: (params: PrismaMiddlewareParams) => Promise<unknown>) => {
        const action = params.action;
        const model = params.model;

        return startSpan(
          {
            name: model ? `${model} ${action}` : action,
            onlyIfParent: true,
            op: 'db.prisma',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.prisma',
              ...clientData,
              'db.operation': action,
            },
          },
          () => next(params),
        );
      });
    } else {
      DEBUG_BUILD &&
        logger.warn('Unsupported Prisma client provided to PrismaIntegration. Provided client:', options.client);
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // Noop - here for backwards compatibility
  }
}
