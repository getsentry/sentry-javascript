import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';

describe('mysql auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'SELECT 1 + 1 AS solution',
        op: 'db',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
      expect.objectContaining({
        description: 'SELECT NOW()',
        op: 'db',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
    ]),
  };

  describe('with connection.connect()', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withConnect.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `mysql` package when using connection.connect()', async () => {
          await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
        });
      },
      { failsOnEsm: true },
    );
  });

  describe('query without callback', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutCallback.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `mysql` package when using query without callback', async () => {
          await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
        });
      },
      { failsOnEsm: true },
    );
  });

  describe('without connection.connect()', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutConnect.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `mysql` package without connection.connect()', async () => {
          await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
        });
      },
      { failsOnEsm: true },
    );
  });

  createEsmAndCjsTests(__dirname, 'scenario-orchestrion.mjs', 'instrument-orchestrion.mjs', (createRunner, test) => {
    test('records db spans for `Connection.query` via the channel-based integration', { timeout: 75_000 }, async () => {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'SELECT 1 + 1 AS solution',
            op: 'db',
            origin: 'auto.db.orchestrion.mysql',
            data: expect.objectContaining({
              'db.system.name': 'mysql',
              'db.query.text': 'SELECT 1 + 1 AS solution',
              'db.operation.name': 'SELECT',
            }),
          }),
          expect.objectContaining({
            description: 'SELECT NOW()',
            op: 'db',
            origin: 'auto.db.orchestrion.mysql',
            data: expect.objectContaining({
              'db.system.name': 'mysql',
              'db.query.text': 'SELECT NOW()',
              'db.operation.name': 'SELECT',
            }),
          }),
        ]),
      };

      await createRunner()
        .expect({ transaction: EXPECTED_TRANSACTION })
        .start()
        .completed();
    });
  });
});
