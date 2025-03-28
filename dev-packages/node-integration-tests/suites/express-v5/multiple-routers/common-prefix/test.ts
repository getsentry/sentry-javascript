import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct urls with multiple routers.', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/test' } })
    .start();
  runner.makeRequest('get', '/api/v1/test');
  await runner.completed();
});
