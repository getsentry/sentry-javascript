/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/core';
import { logger } from '@sentry/utils';

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

  private _middleware?: PrismaMiddleware;

  constructor() {
    this._middleware = undefined;
  }

  public $use(cb: PrismaMiddleware) {
    this._middleware = cb;
  }
}

describe('setupOnce', function () {
  const Client: PrismaClient = new PrismaClient();

  beforeAll(() => {
    new Integrations.Prisma({ client: Client }).setupOnce(
      () => undefined,
      () => new Hub(undefined, new Scope()),
    );
  });

  beforeEach(() => {
    mockTrace.mockClear();
  });

  it('should add middleware with $use method correctly', done => {
    void Client.user.create()?.then(() => {
      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(mockTrace).toHaveBeenLastCalledWith(
        { name: 'user create', op: 'db.sql.prisma', data: { 'db.system': 'prisma' } },
        expect.any(Function),
      );
      done();
    });
  });

  it("doesn't attach when using otel instrumenter", () => {
    const loggerLogSpy = jest.spyOn(logger, 'log');

    const client = getTestClient({ instrumenter: 'otel' });
    const hub = new Hub(client);

    const integration = new Integrations.Prisma({ client: Client });
    integration.setupOnce(
      () => {},
      () => hub,
    );

    expect(loggerLogSpy).toBeCalledWith('Prisma Integration is skipped because of instrumenter configuration.');
  });
});
