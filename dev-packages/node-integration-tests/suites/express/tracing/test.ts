import type { SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

function findSegmentSpan(container: SerializedStreamedSpanContainer): SerializedStreamedSpan | undefined {
  return container.items.find(item => item.is_segment);
}

function findExpressSpan(container: SerializedStreamedSpanContainer, type: string): SerializedStreamedSpan | undefined {
  return container.items.find(item => item.attributes['express.type']?.value === type);
}

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should create and send segment spans for Express routes and spans for middlewares.', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = findSegmentSpan(container);

            expect(serverSpan).toMatchObject({
              name: 'GET /test/express',
              span_id: expect.stringMatching(/[a-f\d]{16}/),
              trace_id: expect.stringMatching(/[a-f\d]{32}/),
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
                'url.full': { type: 'string', value: expect.stringMatching(/\/test\/express$/) },
                'http.response.status_code': { type: 'integer', value: 200 },
              }),
            });

            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: 'corsMiddleware',
                attributes: expect.objectContaining({
                  'express.name': { type: 'string', value: 'corsMiddleware' },
                  'express.type': { type: 'string', value: 'middleware' },
                  'sentry.op': { type: 'string', value: 'middleware' },
                  'sentry.origin': { type: 'string', value: 'auto.http.express' },
                }),
              }),
            );

            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: '/test/express',
                attributes: expect.objectContaining({
                  'express.name': { type: 'string', value: '/test/express' },
                  'express.type': { type: 'string', value: 'request_handler' },
                  'sentry.op': { type: 'string', value: 'handler' },
                  'sentry.origin': { type: 'string', value: 'auto.http.express' },
                }),
              }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/test/express');
      await runner.completed();
    });

    test('names router and request handler spans after their route', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const handlerSpan = findExpressSpan(container, 'request_handler');
            expect(handlerSpan?.name).toBe('/test/router/user/:id');
            // The name has to stay in step with the attribute it comes from.
            expect(handlerSpan?.attributes['http.route']?.value).toBe('/test/router/user/:id');
            expect(handlerSpan?.attributes['sentry.op']?.value).toBe('handler');

            const routerSpan = findExpressSpan(container, 'router');
            expect(routerSpan?.name).toBe('/test/router/user');

            // Spans of other layer types keep their names.
            expect(container.items.find(item => item.name === 'corsMiddleware')?.attributes['express.type']).toEqual({
              type: 'string',
              value: 'middleware',
            });
          },
        })
        .start();

      await runner.makeRequest('get', '/test/router/user/123');

      await runner.completed();
    });

    test('should set a correct segment name for routes specified in RegEx', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(findSegmentSpan(container)).toMatchObject({
              name: 'GET /\\/test\\/regex/',
              span_id: expect.stringMatching(/[a-f\d]{16}/),
              trace_id: expect.stringMatching(/[a-f\d]{32}/),
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
                'sentry.segment.name.source': { type: 'string', value: 'route' },
                'url.full': { type: 'string', value: expect.stringMatching(/\/test\/regex$/) },
                'http.response.status_code': { type: 'integer', value: 200 },
              }),
            });
          },
        })
        .start();
      runner.makeRequest('get', '/test/regex');
      await runner.completed();
    });

    test('nests a sub-router route handler span under the router span', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(findSegmentSpan(container)?.name).toBe('GET /test/router/user/:id');

            const routerSpan = findExpressSpan(container, 'router');
            const handlerSpan = findExpressSpan(container, 'request_handler');

            expect(routerSpan).toBeDefined();
            expect(handlerSpan).toBeDefined();

            // The route handler nests under the router span in both instrumentations.
            expect(handlerSpan?.parent_span_id).toBe(routerSpan?.span_id);

            // The handler delays its response by ~100ms (see scenario).
            const routerDurationMs = ((routerSpan?.end_timestamp ?? 0) - (routerSpan?.start_timestamp ?? 0)) * 1000;

            // The router span stays open until the response finishes, so it spans the
            // whole sub-stack it dispatched (~the 100ms handler delay).
            expect(routerDurationMs).toBeGreaterThan(50);
          },
        })
        .start();
      runner.makeRequest('get', '/test/router/user/42');
      await runner.completed();
    });

    test('keeps the parameter in a route mounted under a parameterized sub-router path', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = findSegmentSpan(container);
            // The `:version` parameter must be preserved — using the concrete value
            // (`/test/version/v1/user`) would explode route cardinality.
            expect(serverSpan?.name).toBe('GET /test/version/:version/user');
            expect(serverSpan?.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });
          },
        })
        .start();
      runner.makeRequest('get', '/test/version/v1/user');
      await runner.completed();
    });

    test('handles root page correctly', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(findSegmentSpan(container)).toMatchObject({
              name: 'GET /',
              span_id: expect.stringMatching(/[a-f\d]{16}/),
              trace_id: expect.stringMatching(/[a-f\d]{32}/),
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
                'http.response.status_code': { type: 'integer', value: 200 },
                'http.request.method': { type: 'string', value: 'GET' },
                'url.full': { type: 'string', value: expect.stringMatching(/\/$/) },
                'http.route': { type: 'string', value: '/' },
                'url.path': { type: 'string', value: '/' },
              }),
            });
          },
        })
        .start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    // With span streaming, child spans are sent as they end, before the response status code is
    // known, so `ignoreStatusCodes` has no effect and these routes are captured like any other.
    test.each([
      { status_code: 401, url: '/401', status_message: 'unauthenticated', name: 'GET /401', source: 'route' },
      { status_code: 402, url: '/402', status_message: 'invalid_argument', name: 'GET /402', source: 'route' },
      { status_code: 403, url: '/403', status_message: 'permission_denied', name: 'GET /403', source: 'route' },
      // Without a matching route the name must not carry the URL path.
      { status_code: 404, url: '/does-not-exist', status_message: 'not_found', name: 'GET', source: 'url' },
    ])(
      'handles %s route correctly',
      async ({
        status_code,
        url,
        status_message,
        name,
        source,
      }: {
        status_code: number;
        url: string;
        status_message: string;
        name: string;
        source: string;
      }) => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name,
                span_id: expect.stringMatching(/[a-f\d]{16}/),
                trace_id: expect.stringMatching(/[a-f\d]{32}/),
                status: 'error',
                attributes: expect.objectContaining({
                  'sentry.op': { type: 'string', value: 'http.server' },
                  'sentry.segment.name.source': { type: 'string', value: source },
                  'sentry.status.message': { type: 'string', value: status_message },
                  'http.response.status_code': { type: 'integer', value: status_code },
                  'http.request.method': { type: 'string', value: 'GET' },
                  'url.full': { type: 'string', value: expect.stringMatching(url) },
                  'url.path': { type: 'string', value: url },
                }),
              });
            },
          })
          .start();
        runner.makeRequest('get', url, { expectError: true });
        await runner.completed();
      },
    );

    test.each([['array1'], ['array5']])(
      'should set a correct segment name for routes consisting of arrays of routes for %p',
      async (segment: string) => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'GET /test/array1,/\\/test\\/array[2-9]/',
                span_id: expect.stringMatching(/[a-f\d]{16}/),
                trace_id: expect.stringMatching(/[a-f\d]{32}/),
                status: 'ok',
                attributes: expect.objectContaining({
                  'sentry.op': { type: 'string', value: 'http.server' },
                  'sentry.segment.name.source': { type: 'string', value: 'route' },
                  'url.full': { type: 'string', value: expect.stringMatching(`/test/${segment}$`) },
                  'http.response.status_code': { type: 'integer', value: 200 },
                }),
              });
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
      const runner = createRunner()
        .expect({
          span: container => {
            expect(findSegmentSpan(container)).toMatchObject({
              name: 'GET /test/arr/:id,/\\/test\\/arr\\d*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/',
              span_id: expect.stringMatching(/[a-f\d]{16}/),
              trace_id: expect.stringMatching(/[a-f\d]{32}/),
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
                'sentry.segment.name.source': { type: 'string', value: 'route' },
                'url.full': { type: 'string', value: expect.stringMatching(`/test/${segment}$`) },
                'http.response.status_code': { type: 'integer', value: 200 },
              }),
            });
          },
        })
        .start();
      await runner.makeRequest('get', `/test/${segment}`);
      await runner.completed();
    });

    describe('request data', () => {
      test('correctly captures JSON request data', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user_agent': { type: 'string', value: expect.stringContaining('') },
                  'http.request.header.content_type': { type: 'string', value: 'application/json' },
                  'http.request.body.data': { type: 'string', value: JSON.stringify({ foo: 'bar', other: 1 }) },
                }),
              });
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
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user_agent': { type: 'string', value: expect.stringContaining('') },
                  'http.request.header.content_type': { type: 'string', value: 'text/plain' },
                  'http.request.body.data': { type: 'string', value: 'some plain text' },
                }),
              });
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
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user_agent': { type: 'string', value: expect.stringContaining('') },
                  'http.request.header.content_type': { type: 'string', value: 'application/octet-stream' },
                  'http.request.body.data': { type: 'string', value: 'some plain text in buffer' },
                }),
              });
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
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user_agent': { type: 'string', value: expect.stringContaining('') },
                  'http.request.header.content_type': { type: 'string', value: 'application/octet-stream' },
                  // This is some non-ascii string representation
                  'http.request.body.data': { type: 'string', value: expect.any(String) },
                }),
              });
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
          .expect({
            span: container => {
              const serverSpan = findSegmentSpan(container);
              expect(serverSpan).toMatchObject({
                name: 'POST /test-post-ignore-body',
                attributes: expect.objectContaining({
                  'url.full': {
                    type: 'string',
                    value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post-ignore-body$/),
                  },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user_agent': { type: 'string', value: expect.stringContaining('') },
                  'http.request.header.content_type': { type: 'string', value: 'application/octet-stream' },
                }),
              });
              // Ensure the request body has been ignored
              expect(serverSpan?.attributes['http.request.body.data']).toBeUndefined();
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
});
