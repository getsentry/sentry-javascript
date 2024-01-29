import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

conditionalTest({ min: 14 })('hapi auto-instrumentation', () => {
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

  test('CJS - should auto-instrument `@hapi/hapi` package.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });
});
