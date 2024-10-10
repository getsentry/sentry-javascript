import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('should create and send transactions for Express routes and spans for middlewares.', done => {
      createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
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
        .start(done)
        .makeRequest('get', '/test/express');
    });

    test('should set a correct transaction name for routes specified in RegEx', done => {
      createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /\\/test\\/regex/',
            transaction_info: {
              source: 'route',
            },
            contexts: {
              trace: {
                trace_id: expect.any(String),
                span_id: expect.any(String),
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
        .start(done)
        .makeRequest('get', '/test/regex');
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
                  trace_id: expect.any(String),
                  span_id: expect.any(String),
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
                trace_id: expect.any(String),
                span_id: expect.any(String),
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
      test('correctly captures JSON request data', done => {
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
          .start(done);

        runner.makeRequest('post', '/test-post', {}, { foo: 'bar', other: 1 });
      });

      test('correctly captures plain text request data', done => {
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
          .start(done);

        runner.makeRequest(
          'post',
          '/test-post',
          {
            'Content-Type': 'text/plain',
          },
          'some plain text',
        );
      });

      test('correctly captures text buffer request data', done => {
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
          .start(done);

        runner.makeRequest(
          'post',
          '/test-post',
          { 'Content-Type': 'application/octet-stream' },
          Buffer.from('some plain text in buffer'),
        );
      });

      test('correctly captures non-text buffer request data', done => {
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
          .start(done);

        const body = new Uint8Array([1, 2, 3, 4, 5]).buffer;

        runner.makeRequest('post', '/test-post', { 'Content-Type': 'application/octet-stream' }, body);
      });
    });
  });
});
