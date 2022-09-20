/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope, makeMain } from '@sentry/hub';

import { Prisma } from '../../../src/integrations/node/prisma';
import { Transaction } from '../../../src/transaction';

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

  let scope: Scope;
  let hub: Hub;
  let transaction: Transaction;

  beforeEach(() => {
    scope = new Scope();
    hub = new Hub(undefined, scope);
    makeMain(hub);
    transaction = new Transaction({ name: 'mock-transaction' });
    transaction.initSpanRecorder();
    scope.setSpan(transaction);
    new Prisma({ client: Client }).setupOnce(
      () => undefined,
      () => hub,
    );
  });

  afterEach(() => {
    transaction.finish();
  });

  it('should add middleware with $use method correctly', async () => {
    const res = await Client.user.create();
    expect(res).toEqual('result');
    expect(transaction.spanRecorder?.spans[1]).toMatchObject({
      op: 'db.prisma',
      description: 'user create',
    });
  });
});
