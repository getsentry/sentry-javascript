import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

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
          'sentry.origin': 'manual',
          'sentry.op': 'http',
        }),
        description: 'GET /',
        op: 'http',
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
      .expectError()
      .start(done)
      .makeRequest('get', '/error');
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
      .expectError()
      .start(done)
      .makeRequest('get', '/error/123');
  });

  test('CJS - should handle returned Boom errors in routes.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /boom-error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .expectError()
      .start(done)
      .makeRequest('get', '/boom-error');
  });

  test('CJS - should handle promise rejections in routes.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: {
          transaction: 'GET /promise-error',
        },
      })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .expectError()
      .start(done)
      .makeRequest('get', '/promise-error');
  });
});
