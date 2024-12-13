import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

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

  test('CJS - should auto-instrument `connect` package.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });

  test('CJS - should capture errors in `connect` middleware.', done => {
    createRunner(__dirname, 'scenario.js')
      .ignore('transaction')
      .expect({ event: EXPECTED_EVENT })
      .start(done)
      .makeRequest('get', '/error');
  });

  test('CJS - should report errored transactions.', done => {
    createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({ transaction: { transaction: 'GET /error' } })
      .start(done)
      .makeRequest('get', '/error');
  });
});
