/* eslint-disable deprecation/deprecation */
import * as sentryCore from '@sentry/core';
import { Hub } from '@sentry/core';

import { Integrations } from '../../../src';
import { getTestClient } from '../../testutils';

const mockTrace = jest.fn();

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    trace: (...args: unknown[]) => {
      mockTrace(...args);
      return original.trace(...args);
    },
  };
});

type PrismaMiddleware = (params: unknown, next: (params?: unknown) => Promise<unknown>) => Promise<unknown>;

class PrismaClient {
  public user: { create: () => Promise<unknown> | undefined } = {
    create: () => this._middleware?.({ action: 'create', model: 'user' }, () => Promise.resolve('result')),
  };

  public _engineConfig = {
    activeProvider: 'postgresql',
    clientVersion: '3.1.2',
  };

  private _middleware?: PrismaMiddleware;

  constructor() {
    this._middleware = undefined;
  }

  public $use(cb: PrismaMiddleware) {
    this._middleware = cb;
  }
}

describe('setupOnce', function () {
  beforeEach(() => {
    mockTrace.mockClear();
    mockTrace.mockReset();
  });

  it('should add middleware with $use method correctly', done => {
    const prismaClient = new PrismaClient();
    new Integrations.Prisma({ client: prismaClient });
    void prismaClient.user.create()?.then(() => {
      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(mockTrace).toHaveBeenLastCalledWith(
        {
          name: 'user create',
          op: 'db.sql.prisma',
          origin: 'auto.db.prisma',
          data: { 'db.system': 'postgresql', 'db.prisma.version': '3.1.2', 'db.operation': 'create' },
        },
        expect.any(Function),
      );
      done();
    });
  });

  it("doesn't trace when using otel instrumenter", done => {
    const prismaClient = new PrismaClient();
    new Integrations.Prisma({ client: prismaClient });

    const client = getTestClient({ instrumenter: 'otel' });
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    void prismaClient.user.create()?.then(() => {
      expect(mockTrace).not.toHaveBeenCalled();
      done();
    });
  });
});
