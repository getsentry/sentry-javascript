import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should attach a baggage header to an outgoing request.', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage?.split(',').sort();

  expect(baggage).toEqual([
    'sentry-environment=prod',
    'sentry-public_key=public',
    'sentry-release=1.0',
    'sentry-sample_rate=1',
    'sentry-sampled=true',
    'sentry-trace_id=__SENTRY_TRACE_ID__',
    'sentry-transaction=GET%20%2Ftest%2Fexpress',
  ]);

  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
});
