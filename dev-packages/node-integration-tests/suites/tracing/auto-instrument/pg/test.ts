import { TestEnv, assertSentryTransaction } from '../../../../utils';

class PgClient {
  database?: string = 'test';
  user?: string = 'user';
  host?: string = 'localhost';
  port?: number = 5432;

  // https://node-postgres.com/api/client#clientquery
  public query(_text: unknown, values: unknown, callback?: () => void) {
    if (typeof callback === 'function') {
      callback();
      return;
    }

    if (typeof values === 'function') {
      values();
      return;
    }

    return Promise.resolve();
  }
}

beforeAll(() => {
  jest.mock('pg', () => {
    return {
      Client: PgClient,
      native: {
        Client: PgClient,
      },
    };
  });
});

test('should auto-instrument `pg` package.', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'Test Transaction',
    spans: [
      {
        description: 'SELECT * FROM foo where bar ilike "baz%"',
        op: 'db',
        data: {
          'db.system': 'postgresql',
          'db.user': 'user',
          'db.name': 'test',
          'server.address': 'localhost',
          'server.port': 5432,
        },
      },
      {
        description: 'SELECT * FROM bazz',
        op: 'db',
        data: {
          'db.system': 'postgresql',
          'db.user': 'user',
          'db.name': 'test',
          'server.address': 'localhost',
          'server.port': 5432,
        },
      },
      {
        description: 'SELECT NOW()',
        op: 'db',
        data: {
          'db.system': 'postgresql',
          'db.user': 'user',
          'db.name': 'test',
          'server.address': 'localhost',
          'server.port': 5432,
        },
      },
    ],
  });
});
