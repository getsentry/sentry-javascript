import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('hapi auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'GET /',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'http.route': '/',
          'http.method': 'GET',
          'hapi.type': 'router',
          'sentry.origin': 'auto.http.otel.hapi',
          'sentry.op': 'router.hapi',
        }),
        description: 'GET /',
        op: 'router.hapi',
        origin: 'auto.http.otel.hapi',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_ERROR_EVENT = {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Test Error',
        },
      ],
    },
  };

  test('CJS - should auto-instrument `@hapi/hapi` package.', async () => {
    const runner = createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start();
    runner.makeRequest('get', '/');
    await runner.completed();
  });

  test('CJS - should handle returned plain errors in routes.', async () => {
    const runner = createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start();
    runner.makeRequest('get', '/error', { expectError: true });
    await runner.completed();
  });

  test('CJS - should assign parameterized transactionName to error.', async () => {
    const runner = createRunner(__dirname, 'scenario.js')
      .expect({
        event: {
          ...EXPECTED_ERROR_EVENT,
          transaction: 'GET /error/{id}',
        },
      })
      .ignore('transaction')
      .start();
    runner.makeRequest('get', '/error/123', { expectError: true });
    await runner.completed();
  });

  test('CJS - should handle returned Boom errors in routes.', async () => {
    const runner = createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /boom-error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start();
    runner.makeRequest('get', '/boom-error', { expectError: true });
    await runner.completed();
  });

  test('CJS - should handle promise rejections in routes.', async () => {
    const runner = createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /promise-error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start();
    runner.makeRequest('get', '/promise-error', { expectError: true });
    await runner.completed();
  });
});
