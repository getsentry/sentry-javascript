import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('express tracesSampler', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('correctly samples & passes data to tracesSampler', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /test/:id',
          },
        })
        .start();

      // This is not sampled
      runner.makeRequest('get', '/test2?q=1');
      // This is sampled
      runner.makeRequest('get', '/test/123?q=1');
      await runner.completed();
    });
  });
});

describe('express tracesSampler includes normalizedRequest data', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('correctly samples & passes data to tracesSampler', async () => {
      const runner = createRunner(__dirname, 'scenario-normalizedRequest.js')
        .expect({
          transaction: {
            transaction: 'GET /test-normalized-request',
          },
        })
        .start();

      runner.makeRequest('get', '/test-normalized-request?query=123');
      await runner.completed();
    });
  });
});
