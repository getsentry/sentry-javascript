import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from '../server';

afterAll(() => {
  cleanupChildProcesses();
});

// TODO(v8): Fix this test
// eslint-disable-next-line jest/no-disabled-tests
test.skip('Includes transaction in baggage if the transaction name is parameterized', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('sentry-transaction=GET%20%2Ftest%2Fexpress'),
    },
  });
});
