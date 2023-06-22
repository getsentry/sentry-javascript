/* eslint-disable deprecation/deprecation */
import { logger } from '@sentry/utils';

import { Integrations } from '../../../src';

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
    new Integrations.Prisma({ client: Client });
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

    new Integrations.Prisma({ client: Client });

    expect(loggerLogSpy).toBeCalledWith('Prisma Integration is skipped because of instrumenter configuration.');
  });
});
