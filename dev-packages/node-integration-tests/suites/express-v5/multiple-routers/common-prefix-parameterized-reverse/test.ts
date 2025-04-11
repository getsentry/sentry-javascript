import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct urls with multiple parameterized routers (use order reversed).', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/user/:userId' } })
    .start();
  runner.makeRequest('get', '/api/v1/user/1234/');
  await runner.completed();
});
