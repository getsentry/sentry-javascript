import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('should create and send transactions for Express routes and spans for middlewares.', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                data: {
                  url: expect.stringMatching(/\/test\/express$/),
                  'http.response.status_code': 200,
                },
                op: 'http.server',
                status: 'ok',
              },
            },
            spans: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  'express.name': 'corsMiddleware',
                  'express.type': 'middleware',
                }),
                description: 'corsMiddleware',
                op: 'middleware.express',
                origin: 'auto.http.otel.express',
              }),
              expect.objectContaining({
                data: expect.objectContaining({
                  'express.name': '/test/express',
                  'express.type': 'request_handler',
                }),
                description: '/test/express',
                op: 'request_handler.express',
                origin: 'auto.http.otel.express',
              }),
            ]),
          },
        })
        .start();
      runner.makeRequest('get', '/test/express');
      await runner.completed();
    });

    test('should set a correct transaction name for routes specified in RegEx', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /\\/test\\/regex/',
            transaction_info: {
              source: 'route',
            },
            contexts: {
              trace: {
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                data: {
                  url: expect.stringMatching(/\/test\/regex$/),
                  'http.response.status_code': 200,
                },
                op: 'http.server',
                status: 'ok',
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test/regex');
      await runner.completed();
    });

    test.each([['array1'], ['array5']])(
      'should set a correct transaction name for routes consisting of arrays of routes for %p',
      ((segment: string, done: () => void) => {
        createRunner(__dirname, 'server.js')
          .expect({
            transaction: {
              transaction: 'GET /test/array1,/\\/test\\/array[2-9]/',
              transaction_info: {
                source: 'route',
              },
              contexts: {
                trace: {
                  trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                  span_id: expect.stringMatching(/[a-f0-9]{16}/),
                  data: {
                    url: expect.stringMatching(`/test/${segment}$`),
                    'http.response.status_code': 200,
                  },
                  op: 'http.server',
                  status: 'ok',
                },
              },
            },
          })
          .start(done)
          .makeRequest('get', `/test/${segment}`);
      }) as any,
    );

    test.each([
      ['arr/545'],
      ['arr/required'],
      ['arr/required'],
      ['arr/requiredPath'],
      ['arr/required/lastParam'],
      ['arr55/required/lastParam'],
      ['arr/requiredPath/optionalPath/'],
      ['arr/requiredPath/optionalPath/lastParam'],
    ])('should handle more complex regexes in route arrays correctly for %p', ((segment: string, done: () => void) => {
      createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /test/arr/:id,/\\/test\\/arr[0-9]*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/',
            transaction_info: {
              source: 'route',
            },
            contexts: {
              trace: {
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                data: {
                  url: expect.stringMatching(`/test/${segment}$`),
                  'http.response.status_code': 200,
                },
                op: 'http.server',
                status: 'ok',
              },
            },
          },
        })
        .start(done)
        .makeRequest('get', `/test/${segment}`);
    }) as any);

    describe('request data', () => {
      test('correctly captures JSON request data', async () => {
        const runner = createRunner(__dirname, 'server.js')
          .expect({
            transaction: {
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

        runner.makeRequest('post', '/test-post', { data: { foo: 'bar', other: 1 } });
        await runner.completed();
      });

      test('correctly captures plain text request data', async () => {
        const runner = createRunner(__dirname, 'server.js')
          .expect({
            transaction: {
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
          headers: { 'Content-Type': 'text/plain' },
          data: 'some plain text',
        });
        await runner.completed();
      });

      test('correctly captures text buffer request data', async () => {
        const runner = createRunner(__dirname, 'server.js')
          .expect({
            transaction: {
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
        const runner = createRunner(__dirname, 'server.js')
          .expect({
            transaction: {
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

        runner.makeRequest('post', '/test-post', {
          headers: { 'Content-Type': 'application/octet-stream' },
          data: body,
        });
        await runner.completed();
      });
    });
  });
});
