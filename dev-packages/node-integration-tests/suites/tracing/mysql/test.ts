import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';

describe('mysql auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `mysql` package when using connection.connect()', async () => {
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

    await createRunner(__dirname, 'scenario-withConnect.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should auto-instrument `mysql` package when using query without callback', async () => {
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

    await createRunner(__dirname, 'scenario-withoutCallback.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should auto-instrument `mysql` package without connection.connect()', async () => {
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

    await createRunner(__dirname, 'scenario-withoutConnect.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
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

      await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });
});
