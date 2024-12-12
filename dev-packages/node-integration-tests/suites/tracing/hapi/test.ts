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

  test('CJS - should auto-instrument `@hapi/hapi` package.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });

  test('CJS - should handle returned plain errors in routes.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start(done)
      .makeRequest('get', '/error', { expectError: true });
  });

  test('CJS - should assign parameterized transactionName to error.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        event: {
          ...EXPECTED_ERROR_EVENT,
          transaction: 'GET /error/{id}',
        },
      })
      .ignore('transaction')
      .start(done)
      .makeRequest('get', '/error/123', { expectError: true });
  });

  test('CJS - should handle returned Boom errors in routes.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /boom-error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start(done)
      .makeRequest('get', '/boom-error', { expectError: true });
  });

  test('CJS - should handle promise rejections in routes.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /promise-error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start(done)
      .makeRequest('get', '/promise-error', { expectError: true });
  });
});
