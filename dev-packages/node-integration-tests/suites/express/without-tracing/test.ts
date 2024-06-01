import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('correctly applies isolation scope even without tracing', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('session', 'sessions')
    .expect({
      event: {
        transaction: 'GET /test/isolationScope/1',
        tags: {
          global: 'tag',
          'isolation-scope': 'tag',
          'isolation-scope-1': '1',
        },
        // Request is correctly set
        request: {
          url: expect.stringContaining('/test/isolationScope/1'),
          headers: {
            'user-agent': expect.stringContaining(''),
          },
        },
      },
    })
    .expect({
      event: {
        transaction: 'GET /test/isolationScope/2',
        tags: {
          global: 'tag',
          'isolation-scope': 'tag',
          'isolation-scope-2': '2',
        },
        // Request is correctly set
        request: {
          url: expect.stringContaining('/test/isolationScope/2'),
          headers: {
            'user-agent': expect.stringContaining(''),
          },
        },
      },
    })
    .start(done);

  runner.makeRequest('get', '/test/isolationScope/1').then(() => runner.makeRequest('get', '/test/isolationScope/2'));
});
