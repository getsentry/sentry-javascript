import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('connect auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'GET /',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'connect.name': '/',
          'connect.type': 'request_handler',
          'http.route': '/',
          'sentry.origin': 'auto.http.otel.connect',
          'sentry.op': 'request_handler.connect',
        }),
        description: '/',
        origin: 'auto.http.otel.connect',
        op: 'request_handler.connect',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_EVENT = {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Test Error',
        },
      ],
    },
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('should auto-instrument `connect` package.', async () => {
        const runner = createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start();
        runner.makeRequest('get', '/');
        await runner.completed();
      });

      test('should capture errors in `connect` middleware.', async () => {
        const runner = createTestRunner().ignore('transaction').expect({ event: EXPECTED_EVENT }).start();
        runner.makeRequest('get', '/error');
        await runner.completed();
      });

      test('should report errored transactions.', async () => {
        const runner = createTestRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'GET /error' } })
          .start();
        runner.makeRequest('get', '/error');
        await runner.completed();
      });
    },
    { failsOnEsm: true },
  );
});
