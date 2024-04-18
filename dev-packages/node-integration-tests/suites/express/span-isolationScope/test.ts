import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('correctly applies isolation scope to span', done => {
  createRunner(__dirname, 'server.ts')
    .ignore('session', 'sessions')
    .expect({
      transaction: {
        transaction: 'GET /test/isolationScope',
        breadcrumbs: [
          {
            category: 'console',
            level: 'log',
            message: expect.stringMatching(/\{"port":(\d+)\}/),
            timestamp: expect.any(Number),
          },
          {
            category: 'console',
            level: 'log',
            message: 'This is a test log.',
            timestamp: expect.any(Number),
          },
          {
            message: 'manual breadcrumb',
            timestamp: expect.any(Number),
          },
        ],
        tags: {
          global: 'tag',
          'isolation-scope': 'tag',
        },
      },
    })
    .start(done)
    .makeRequest('get', '/test/isolationScope');
});
