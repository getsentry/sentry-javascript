import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('express without tracing', () => {
  test('correctly applies isolation scope even without tracing', async () => {
    const runner = createRunner(__dirname, 'server.ts')
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
            url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test\/isolationScope\/1$/),
            method: 'GET',
            headers: {
              'user-agent': expect.stringContaining(''),
            },
          },
        },
      })
      .start();

    runner.makeRequest('get', '/test/isolationScope/1');
    await runner.completed();
  });

  describe('request data', () => {
    test('correctly captures JSON request data', async () => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'application/json',
              },
              data: JSON.stringify({
                foo: 'bar',
                other: 1,
              }),
            },
          },
        })
        .start();

      runner.makeRequest('post', '/test-post', {
        headers: {
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({ foo: 'bar', other: 1 }),
      });
      await runner.completed();
    });

    test('correctly captures plain text request data', async () => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'text/plain',
              },
              data: 'some plain text',
            },
          },
        })
        .start();

      runner.makeRequest('post', '/test-post', {
        headers: {
          'Content-Type': 'text/plain',
        },
        data: 'some plain text',
      });
      await runner.completed();
    });

    test('correctly captures text buffer request data', async () => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'application/octet-stream',
              },
              data: 'some plain text in buffer',
            },
          },
        })
        .start();

      runner.makeRequest('post', '/test-post', {
        headers: { 'Content-Type': 'application/octet-stream' },
        data: Buffer.from('some plain text in buffer'),
      });
      await runner.completed();
    });

    test('correctly captures non-text buffer request data', async () => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'application/octet-stream',
              },
              // This is some non-ascii string representation
              data: expect.any(String),
            },
          },
        })
        .start();

      const body = new Uint8Array([1, 2, 3, 4, 5]).buffer;

      runner.makeRequest('post', '/test-post', { headers: { 'Content-Type': 'application/octet-stream' }, data: body });
      await runner.completed();
    });
  });
});
