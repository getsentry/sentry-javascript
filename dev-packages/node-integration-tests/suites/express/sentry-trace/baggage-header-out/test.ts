import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

// TODO(v8): Fix this test
// eslint-disable-next-line jest/no-disabled-tests
test.skip('should attach a baggage header to an outgoing request.', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage:
        'sentry-environment=prod,sentry-release=1.0,sentry-public_key=public' +
        ',sentry-trace_id=__SENTRY_TRACE_ID__,sentry-sample_rate=1,sentry-transaction=GET%20%2Ftest%2Fexpress' +
        ',sentry-sampled=true',
    },
  });
});
