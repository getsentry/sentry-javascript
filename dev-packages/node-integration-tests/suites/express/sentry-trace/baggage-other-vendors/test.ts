import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should merge `baggage` header of a third party vendor with the Sentry DSC baggage items', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
    baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
  });

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'other=vendor,foo=bar,third=party,sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });
});
