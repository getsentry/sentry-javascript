import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct url with multiple parameterized routers of the same length (use order reversed).', done => {
  createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/:userId' } })
    .start(done)
    .makeRequest('get', '/api/v1/1234/');
});
