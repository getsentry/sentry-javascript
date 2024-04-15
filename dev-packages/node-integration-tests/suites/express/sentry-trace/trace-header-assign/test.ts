import { TRACEPARENT_REGEXP } from '@sentry/utils';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from '../server';

afterAll(() => {
  cleanupChildProcesses();
});

test('Should assign `sentry-trace` header which sets parent trace id of an outgoing request.', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
  });

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      'sentry-trace': expect.stringContaining('12312012123120121231201212312012-'),
    },
  });

  expect(TRACEPARENT_REGEXP.test(response?.test_data['sentry-trace'] || '')).toBe(true);
});
