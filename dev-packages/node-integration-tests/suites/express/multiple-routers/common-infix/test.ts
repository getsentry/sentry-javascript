import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should construct correct url with common infixes with multiple routers.', done => {
  createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({ event: { message: 'Custom Message', transaction: 'GET /api2/v1/test' } })
    .start(done)
    .makeRequest('get', '/api2/v1/test');
});
