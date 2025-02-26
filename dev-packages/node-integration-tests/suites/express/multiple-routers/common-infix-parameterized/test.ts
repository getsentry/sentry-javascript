import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct url with common infixes with multiple parameterized routers.', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/user/:userId' } })
    .start();
  runner.makeRequest('get', '/api/v1/user/3212');
  await runner.completed();
});
