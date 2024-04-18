import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

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
          'otel.kind': 'INTERNAL',
          'sentry.origin': 'manual',
        }),
        description: 'request handler - /',
        origin: 'manual',
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

  test('CJS - should auto-instrument `connect` package.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });

  test('CJS - should capture errors in `connect` middleware.', done => {
    createRunner(__dirname, 'scenario.js')
      .ignore('transaction', 'session', 'sessions')
      .expectError()
      .expect({ event: EXPECTED_EVENT })
      .start(done)
      .makeRequest('get', '/error');
  });

  test('CJS - should report errored transactions.', done => {
    createRunner(__dirname, 'scenario.js')
      .ignore('event', 'session', 'sessions')
      .expect({ transaction: { transaction: 'GET /error' } })
      .expectError()
      .start(done)
      .makeRequest('get', '/error');
  });
});
