import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct urls with multiple parameterized routers (use order reversed).', done => {
  createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/user/:userId' } })
    .start(done)
    .makeRequest('get', '/api/v1/user/1234/');
});
