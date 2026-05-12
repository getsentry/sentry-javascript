import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should merge `baggage` header of a third party vendor with the Sentry DSC baggage items', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,sentry-sample_rand=0.42',
    },
  });

  expect(response).toBeDefined();
  expect(response?.test_data.host).toBe('somewhere.not.sentry');
  expect(response?.test_data.baggage?.split(',').sort()).toEqual([
    'foo=bar',
    'other=vendor',
    'sentry-environment=myEnv',
    'sentry-release=2.0.0',
    'sentry-sample_rand=0.42',
    'third=party',
  ]);
});
