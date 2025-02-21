import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('express tracesSampler', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('correctly samples & passes data to tracesSampler', done => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /test/:id',
          },
        })
        .start(done);

      // This is not sampled
      runner.makeRequest('get', '/test2?q=1');
      // This is sampled
      runner.makeRequest('get', '/test/123?q=1');
    });
  });
});

describe('express tracesSampler includes normalizedRequest data', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('correctly samples & passes data to tracesSampler', done => {
      const runner = createRunner(__dirname, 'scenario-normalizedRequest.js')
        .expect({
          transaction: {
            transaction: 'GET /test-normalized-request',
          },
        })
        .start(done);

      runner.makeRequest('get', '/test-normalized-request?query=123');
    });
  });
});
