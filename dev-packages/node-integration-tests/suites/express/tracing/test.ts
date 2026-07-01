import { afterAll, describe, expect } from 'vitest';
import { assertSentryTransaction } from '../../../utils/assertions';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe.each([
    ['otel', {}],
    ['orchestrion', { USE_ORCHESTRION: 'true' }],
  ])('%s', (name, env: Record<string, string>) => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should create and send transactions for Express routes and spans for middlewares.', async () => {
        const runner = createRunner()
          .withEnv(env)
          .expect({
            transaction: {
              contexts: {
                trace: {
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
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
                  origin: 'auto.http.express',
                }),
                expect.objectContaining({
                  data: expect.objectContaining({
                    'express.name': '/test/express',
                    'express.type': 'request_handler',
                  }),
                  description: '/test/express',
                  op: 'request_handler.express',
                  origin: 'auto.http.express',
                }),
              ]),
            },
          })
          .start();
        runner.makeRequest('get', '/test/express');
        await runner.completed();
      });

      test('should set a correct transaction name for routes specified in RegEx', async () => {
        const runner = createRunner()
          .withEnv(env)
          .expect({
            transaction: {
              transaction: 'GET /\\/test\\/regex/',
              transaction_info: {
                source: 'route',
              },
              contexts: {
                trace: {
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
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

      test('nests a sub-router route handler span under the router span', async () => {
        const runner = createRunner()
          .withEnv(env)
          .expect({
            transaction: transaction => {
              expect(transaction.transaction).toBe('GET /test/router/user/:id');

              const spans = transaction.spans || [];
              const routerSpan = spans.find(span => span.data?.['express.type'] === 'router');
              const handlerSpan = spans.find(span => span.data?.['express.type'] === 'request_handler');

              expect(routerSpan).toBeDefined();
              expect(handlerSpan).toBeDefined();

              // The route handler nests under the router span in both instrumentations.
              expect(handlerSpan?.parent_span_id).toBe(routerSpan?.span_id);

              // The handler delays its response by ~100ms (see scenario).
              const routerDurationMs = ((routerSpan?.timestamp ?? 0) - (routerSpan?.start_timestamp ?? 0)) * 1000;

              if (name === 'orchestrion') {
                // The orchestrion router span stays open until the response finishes, so
                // it spans the whole sub-stack it dispatched (~the 100ms handler delay).
                expect(routerDurationMs).toBeGreaterThan(50);
              } else {
                // The OTel integration ends router spans immediately, so the router span
                // is a ~0ms marker regardless of how long its sub-stack runs.
                expect(routerDurationMs).toBeLessThan(50);
              }
            },
          })
          .start();
        runner.makeRequest('get', '/test/router/user/42');
        await runner.completed();
      });

      test('keeps the parameter in a route mounted under a parameterized sub-router path', async () => {
        const runner = createRunner()
          .withEnv(env)
          .expect({
            transaction: {
              // The `:version` parameter must be preserved — using the concrete value
              // (`/test/version/v1/user`) would explode route cardinality.
              transaction: 'GET /test/version/:version/user',
              transaction_info: {
                source: 'route',
              },
            },
          })
          .start();
        runner.makeRequest('get', '/test/version/v1/user');
        await runner.completed();
      });

      test('handles root page correctly', async () => {
        const runner = createRunner()
          .withEnv(env)
          .expect({
            transaction: {
              transaction: 'GET /',
              contexts: {
                trace: {
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
                  data: {
                    'http.response.status_code': 200,
                    url: expect.stringMatching(/\/$/),
                    'http.method': 'GET',
                    'http.url': expect.stringMatching(/\/$/),
                    'http.route': '/',
                    'http.target': '/',
                  },
                  op: 'http.server',
                  status: 'ok',
                },
              },
            },
          })
          .start();
        runner.makeRequest('get', '/');
        await runner.completed();
      });

      test.each(['/401', '/402', '/403', '/does-not-exist'])('ignores %s route by default', async (url: string) => {
        const runner = createRunner()
          .withEnv(env)
          .expect({
            // No transaction is sent for the 401, 402, 403, 404 routes
            transaction: {
              transaction: 'GET /',
            },
          })
          .start();
        runner.makeRequest('get', url, { expectError: true });
        runner.makeRequest('get', '/');
        await runner.completed();
      });

      test.each([['array1'], ['array5']])(
        'should set a correct transaction name for routes consisting of arrays of routes for %p',
        async (segment: string) => {
          const runner = await createRunner()
            .withEnv(env)
            .expect({
              transaction: {
                transaction: 'GET /test/array1,/\\/test\\/array[2-9]/',
                transaction_info: {
                  source: 'route',
                },
                contexts: {
                  trace: {
                    trace_id: expect.stringMatching(/[a-f\d]{32}/),
                    span_id: expect.stringMatching(/[a-f\d]{16}/),
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
            .start();
          await runner.makeRequest('get', `/test/${segment}`);
          await runner.completed();
        },
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
      ])('should handle more complex regexes in route arrays correctly for %p', async (segment: string) => {
        const runner = await createRunner()
          .withEnv(env)
          .expect({
            transaction: {
              transaction: 'GET /test/arr/:id,/\\/test\\/arr\\d*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/',
              transaction_info: {
                source: 'route',
              },
              contexts: {
                trace: {
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
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
          .start();
        await runner.makeRequest('get', `/test/${segment}`);
        await runner.completed();
      });

      describe('request data', () => {
        test('correctly captures JSON request data', async () => {
          const runner = createRunner()
            .withEnv(env)
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

          runner.makeRequest('post', '/test-post', {
            headers: {
              'Content-Type': 'application/json',
            },
            data: JSON.stringify({ foo: 'bar', other: 1 }),
          });
          await runner.completed();
        });

        test('correctly captures plain text request data', async () => {
          const runner = createRunner()
            .withEnv(env)
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
          const runner = createRunner()
            .withEnv(env)
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
          const runner = createRunner()
            .withEnv(env)
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

        test('correctly ignores request data', async () => {
          const runner = createRunner()
            .withEnv(env)
            .expect({
              transaction: e => {
                assertSentryTransaction(e, {
                  transaction: 'POST /test-post-ignore-body',
                  request: {
                    url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post-ignore-body$/),
                    method: 'POST',
                    headers: {
                      'user-agent': expect.stringContaining(''),
                      'content-type': 'application/octet-stream',
                    },
                  },
                });
                // Ensure the request body has been ignored
                expect(e).have.property('request').that.does.not.have.property('data');
              },
            })
            .start();

          runner.makeRequest('post', '/test-post-ignore-body', {
            headers: { 'Content-Type': 'application/octet-stream' },
            data: Buffer.from('some plain text in buffer'),
          });
          await runner.completed();
        });
      });
    });

    describe('filter status codes', () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario-filterStatusCode.mjs',
        'instrument-filterStatusCode.mjs',
        (createRunner, test) => {
          // We opt-out of the default [401, 404] filtering in order to test how these spans are handled
          test.each([
            { status_code: 401, url: '/401', status: 'unauthenticated' },
            { status_code: 402, url: '/402', status: 'invalid_argument' },
            { status_code: 403, url: '/403', status: 'permission_denied' },
            { status_code: 404, url: '/does-not-exist', status: 'not_found' },
          ])(
            'handles %s route correctly',
            async ({ status_code, url, status }: { status_code: number; url: string; status: string }) => {
              const runner = createRunner()
                .withEnv(env)
                .expect({
                  transaction: {
                    transaction: `GET ${url}`,
                    contexts: {
                      trace: {
                        span_id: expect.stringMatching(/[a-f\d]{16}/),
                        trace_id: expect.stringMatching(/[a-f\d]{32}/),
                        data: {
                          'http.response.status_code': status_code,
                          url: expect.stringMatching(url),
                          'http.method': 'GET',
                          'http.url': expect.stringMatching(url),
                          'http.target': url,
                        },
                        op: 'http.server',
                        status,
                      },
                    },
                  },
                })
                .start();
              runner.makeRequest('get', url, { expectError: true });
              await runner.completed();
            },
          );

          test('filters defined status codes', async () => {
            const runner = createRunner()
              .withEnv(env)
              .expect({
                transaction: {
                  transaction: 'GET /',
                },
              })
              .start();
            await runner.makeRequest('get', '/499', { expectError: true });
            await runner.makeRequest('get', '/300', { expectError: true });
            await runner.makeRequest('get', '/399', { expectError: true });
            await runner.makeRequest('get', '/');
            await runner.completed();
          });
        },
      );
    });
  });
});
