import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct urls with multiple routers.', done => {
  createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/test' } })
    .start(done)
    .makeRequest('get', '/api/v1/test');
});
