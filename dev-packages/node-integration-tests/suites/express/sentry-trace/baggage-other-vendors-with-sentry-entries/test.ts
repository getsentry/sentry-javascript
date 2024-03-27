import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from '../server';

afterAll(() => {
  cleanupChildProcesses();
});

// TODO(v8): Fix this test
// eslint-disable-next-line jest/no-disabled-tests
test.skip('should ignore sentry-values in `baggage` header of a third party vendor and overwrite them with incoming DSC', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
    baggage: 'sentry-release=2.1.0,sentry-environment=myEnv',
  });

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: [
        'other=vendor,foo=bar,third=party,sentry-release=9.9.9,sentry-environment=staging,sentry-sample_rate=0.54,last=item',
        'sentry-release=2.1.0,sentry-environment=myEnv',
      ],
    },
  });
});

// TODO(v8): Fix this test
// eslint-disable-next-line jest/no-disabled-tests
test.skip('should ignore sentry-values in `baggage` header of a third party vendor and overwrite them with new DSC', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: [
        'other=vendor,foo=bar,third=party,sentry-release=9.9.9,sentry-environment=staging,sentry-sample_rate=0.54,last=item',
        expect.stringMatching(
          /sentry-environment=prod,sentry-release=1\.0,sentry-public_key=public,sentry-trace_id=[0-9a-f]{32},sentry-sample_rate=1,sentry-transaction=GET%20%2Ftest%2Fexpress/,
        ),
      ],
    },
  });
});
