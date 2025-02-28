import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct url with multiple parameterized routers of the same length (use order reversed).', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/:userId' } })
    .start();
  runner.makeRequest('get', '/api/v1/1234/');
  await runner.completed();
});
