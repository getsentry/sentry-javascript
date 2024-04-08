import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from '../server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should ignore sentry-values in `baggage` header of a third party vendor and overwrite them with incoming DSC', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
    baggage: 'sentry-release=2.1.0,sentry-environment=myEnv',
  });

  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage?.split(',').sort();

  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });

  expect(baggage).toEqual([
    'foo=bar',
    'last=item',
    'other=vendor',
    'sentry-environment=myEnv',
    'sentry-release=2.1.0',
    'sentry-sample_rate=0.54',
    'third=party',
  ]);
});

test('should ignore sentry-values in `baggage` header of a third party vendor and overwrite them with new DSC', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage?.split(',').sort();

  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });

  expect(baggage).toEqual([
    'foo=bar',
    'last=item',
    'other=vendor',
    'sentry-environment=prod',
    'sentry-public_key=public',
    'sentry-release=1.0',
    'sentry-sample_rate=1',
    'sentry-sampled=true',
    expect.stringMatching(/sentry-trace_id=[0-9a-f]{32}/),
    'sentry-transaction=GET%20%2Ftest%2Fexpress',
    'third=party',
  ]);
});
