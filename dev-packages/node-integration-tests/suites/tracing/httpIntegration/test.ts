import { HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import { createTestServer } from '@sentry-internal/test-utils';
import { HTTP_RESPONSE_STATUS_CODE, SENTRY_OP, URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';
import { RUNTIME } from '../../../utils';

function getCommonHttpRequestHeaders(): Record<string, unknown> {
  return {
    'http.request.header.accept': ['*/*'],
    'http.request.header.accept-encoding': ['gzip, deflate'],
    'http.request.header.accept-language': ['*'],
    'http.request.header.connection': ['keep-alive'],
    'http.request.header.host': [expect.any(String)],
    'http.request.header.sec-fetch-mode': ['cors'],
    'http.request.header.user-agent': ['node'],
  };
}

describe('httpIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('onSpanCreated option', () => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument-options.mjs', (createRunner, test) => {
      test('allows to configure onSpanCreated', async () => {
        const runner = createRunner()
          .expect({
            span: {
              items: expect.arrayContaining([
                expect.objectContaining({
                  is_segment: true,
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
                  status: 'ok',
                  attributes: expect.objectContaining({
                    [URL_FULL]: { type: 'string', value: expect.stringMatching(/\/test$/) },
                    [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                    [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                    onSpanCreated: { type: 'string', value: 'yes' },
                    'onSpanCreated.reqUrl': { type: 'string', value: expect.stringMatching(/\/test$/) },
                    'onSpanCreated.reqMethod': { type: 'string', value: 'GET' },
                    'onSpanCreated.resUrl': { type: 'string', value: expect.stringMatching(/\/test$/) },
                    'onSpanCreated.resMethod': { type: 'string', value: 'GET' },
                  }),
                }),
              ]),
            },
          })
          .start();
        runner.makeRequest('get', '/test');
        await runner.completed();
      });
    });
  });

  describe('outgoing request span hooks', () => {
    test('runs outgoingRequestHook, outgoingResponseHook and outgoingRequestApplyCustomAttributes', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/users/42', () => {}, 200)
        .start();

      const runner = createRunner(__dirname, 'server-outgoingHooks.js')
        .withEnv({ SERVER_URL })
        .expect({
          span: container => {
            const clientSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === HTTP_CLIENT);
            expect(clientSpans).toHaveLength(1);

            // All three hooks run before the span ends, so every attribute has to survive to the envelope.
            const data = clientSpans[0]?.attributes;
            expect(data?.['outgoingRequestHook']).toEqual({ type: 'string', value: 'GET' });
            expect(data?.['outgoingResponseHook']).toEqual({ type: 'integer', value: 200 });
            expect(data?.['outgoingRequestApplyCustomAttributes']).toEqual({ type: 'string', value: 'GET 200' });
          },
        })
        .start();
      runner.makeRequest('get', '/testOutgoing');
      await runner.completed();
      closeTestServer();
    });
  });

  describe('http.server spans', () => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
      test('captures correct attributes for GET requests', async () => {
        const runner = createRunner()
          .expect({
            transaction: transaction => {
              const port = runner.getPort();
              expect(transaction.transaction).toBe('GET /test');
              expect(transaction.contexts?.trace?.data).toEqual({
                'http.request.method': 'GET',
                'url.query': 'a=1&b=2',
                'http.response.status_code': 200,
                'http.route': '/test',
                'url.scheme': 'http',
                'http.response.status_text': 'OK',
                'user_agent.original': 'node',
                'client.address': '::1',
                'client.port': expect.any(Number),
                'network.local.address': '::1',
                'server.address': 'localhost',
                'server.port': port,
                'network.local.port': port,
                'network.peer.address': '::1',
                'network.peer.port': expect.any(Number),
                'network.protocol.name': 'http',
                'network.protocol.version': '1.1',
                'network.transport': 'tcp',
                'sentry.kind': 'server',
                'sentry.op': 'http.server',
                'sentry.origin': 'auto.http.http_server',
                'sentry.sample_rate': 1,
                'sentry.segment.name.source': 'route',
                [URL_FULL]: `http://localhost:${port}/test?a=1&b=2`,
                [URL_PATH]: '/test',
                ...getCommonHttpRequestHeaders(),
              });
            },
          })
          .start();

        runner.makeRequest('get', '/test?a=1&b=2#hash');
        await runner.completed();
      });

      test('captures correct attributes for POST requests', async () => {
        const runner = createRunner()
          .expect({
            transaction: transaction => {
              const port = runner.getPort();
              expect(transaction.transaction).toBe('POST /test');
              expect(transaction.contexts?.trace?.data).toEqual({
                'http.request.method': 'POST',
                'url.query': 'a=1&b=2',
                'http.request.body.size': 9,
                'http.response.status_code': 200,
                'http.route': '/test',
                'url.scheme': 'http',
                'http.response.status_text': 'OK',
                'user_agent.original': 'node',
                'client.address': '::1',
                'client.port': expect.any(Number),
                'network.local.address': '::1',
                'server.address': 'localhost',
                'server.port': port,
                'network.local.port': port,
                'network.peer.address': '::1',
                'network.peer.port': expect.any(Number),
                'network.protocol.name': 'http',
                'network.protocol.version': '1.1',
                'network.transport': 'tcp',
                'sentry.kind': 'server',
                'sentry.op': 'http.server',
                'sentry.origin': 'auto.http.http_server',
                'sentry.sample_rate': 1,
                'sentry.segment.name.source': 'route',
                [URL_FULL]: `http://localhost:${port}/test?a=1&b=2`,
                [URL_PATH]: '/test',
                'http.request.header.content-length': ['9'],
                'http.request.header.content-type': ['text/plain;charset=UTF-8'],
                ...getCommonHttpRequestHeaders(),
              });
            },
          })
          .start();

        runner.makeRequest('post', '/test?a=1&b=2#hash', { data: 'test body' });
        await runner.completed();
      });

      test('prefers the forwarded client address, without the socket port', async () => {
        const runner = createRunner()
          .expect({
            transaction: transaction => {
              const data = transaction.contexts?.trace?.data;
              expect(data).toEqual(
                expect.objectContaining({
                  'client.address': '203.0.113.7',
                  'network.peer.address': '::1',
                  'network.peer.port': expect.any(Number),
                }),
              );
              expect(data).not.toHaveProperty('client.port');
            },
          })
          .start();

        runner.makeRequest('get', '/test', { headers: { 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' } });
        await runner.completed();
      });
    });

    // Deno: the requests sometimes get a 500 response when `server.emit` is overwritten.
    describe.skipIf(RUNTIME === 'deno')('custom server.emit', () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario-overwrite-server-emit.mjs',
        'instrument-overwrite-server-emit.mjs',
        (createRunner, test) => {
          test('handles server.emit being overwritten via classic monkey patching', async () => {
            const runner = createRunner()
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test1' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test2' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test3' },
                      },
                    },
                  ],
                },
              })
              .start();

            await runner.makeRequest('get', '/test1');
            await runner.makeRequest('get', '/test2');
            await runner.makeRequest('get', '/test3');
            await runner.completed();
          });

          test('handles server.emit being overwritten via proxy', async () => {
            const runner = createRunner()
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test1-proxy' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test2-proxy' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: expect.arrayContaining([
                    expect.objectContaining({
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: expect.objectContaining({
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test3-proxy' },
                      }),
                    }),
                  ]),
                },
              })
              .start();

            await runner.makeRequest('get', '/test1-proxy');
            await runner.makeRequest('get', '/test2-proxy');
            await runner.makeRequest('get', '/test3-proxy');
            await runner.completed();
          });

          test('handles server.emit being overwritten via classic monkey patching, using initial server.emit', async () => {
            const runner = createRunner()
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test1-original' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test2-original' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test3-original' },
                      },
                    },
                  ],
                },
              })
              .start();

            await runner.makeRequest('get', '/test1-original');
            await runner.makeRequest('get', '/test2-original');
            await runner.makeRequest('get', '/test3-original');
            await runner.completed();
          });

          test('handles server.emit being overwritten via proxy, using initial server.emit', async () => {
            const runner = createRunner()
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test1-proxy-original' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test2-proxy-original' },
                      },
                    },
                  ],
                },
              })
              .expect({
                span: {
                  items: [
                    {
                      name: 'GET',
                      is_segment: true,
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      attributes: {
                        [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                        [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                        [URL_PATH]: { type: 'string', value: '/test3-proxy-original' },
                      },
                    },
                  ],
                },
              })
              .start();

            await runner.makeRequest('get', '/test1-proxy-original');
            await runner.makeRequest('get', '/test2-proxy-original');
            await runner.makeRequest('get', '/test3-proxy-original');
            await runner.completed();
          });
        },
      );
    });
  });

  describe("doesn't create a root span for incoming requests ignored via `ignoreIncomingRequests`", () => {
    test('via the url param', async () => {
      const runner = createRunner(__dirname, 'server-ignoreIncomingRequests.js')
        .expect({
          span: {
            items: expect.arrayContaining([
              expect.objectContaining({
                name: 'GET /test',
                is_segment: true,
                span_id: expect.stringMatching(/[a-f\d]{16}/),
                trace_id: expect.stringMatching(/[a-f\d]{32}/),
                status: 'ok',
                attributes: expect.objectContaining({
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/\/test$/) },
                  [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                  [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                }),
              }),
            ]),
          },
        })
        .start();

      await runner.makeRequest('get', '/liveness'); // should be ignored
      // Flush so any span from the ignored request fails the expectation before /test runs.
      await runner.makeRequest('get', '/flush');
      await runner.makeRequest('get', '/test');
      await runner.completed();
    });

    test('via the request param', async () => {
      const runner = createRunner(__dirname, 'server-ignoreIncomingRequests.js')
        .expect({
          span: {
            items: expect.arrayContaining([
              expect.objectContaining({
                name: 'GET /test',
                is_segment: true,
                span_id: expect.stringMatching(/[a-f\d]{16}/),
                trace_id: expect.stringMatching(/[a-f\d]{32}/),
                status: 'ok',
                attributes: expect.objectContaining({
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/\/test$/) },
                  [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                  [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                }),
              }),
            ]),
          },
        })
        .start();

      await runner.makeRequest('post', '/readiness'); // should be ignored
      // Flush so any span from the ignored request fails the expectation before /test runs.
      await runner.makeRequest('get', '/flush');
      await runner.makeRequest('get', '/test');
      await runner.completed();
    });
  });

  describe("doesn't create child spans or breadcrumbs for outgoing requests ignored via `ignoreOutgoingRequests`", () => {
    test('via the url param', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/blockUrl', () => {}, 200)
        .get('/pass', () => {}, 200)
        .start();

      const runner = createRunner(__dirname, 'server-ignoreOutgoingRequests.js')
        .withEnv({ SERVER_URL })
        .expect({
          event: event => {
            const breadcrumbs = event.breadcrumbs?.filter(b => b.category === 'http');
            expect(breadcrumbs).toHaveLength(1);
            expect(breadcrumbs![0]?.data?.url).toEqual(`${SERVER_URL}/pass`);
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('GET /testUrl');

            const requestSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === HTTP_CLIENT);
            expect(requestSpans).toHaveLength(1);
            expect(requestSpans[0]?.name).toBe('GET localhost');
            expect(requestSpans[0]?.attributes[URL_FULL]).toEqual({ type: 'string', value: `${SERVER_URL}/pass` });
          },
        })
        .start();
      runner.makeRequest('get', '/testUrl');
      await runner.completed();
      closeTestServer();
    });

    test('via the request param', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/blockUrl', () => {}, 200)
        .get('/pass', () => {}, 200)
        .start();

      const runner = createRunner(__dirname, 'server-ignoreOutgoingRequests.js')
        .withEnv({ SERVER_URL })
        .expect({
          event: event => {
            const breadcrumbs = event.breadcrumbs?.filter(b => b.category === 'http');
            expect(breadcrumbs).toHaveLength(1);
            expect(breadcrumbs![0]?.data?.url).toEqual(`${SERVER_URL}/pass`);
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('GET /testRequest');

            const requestSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === HTTP_CLIENT);
            expect(requestSpans).toHaveLength(1);
            expect(requestSpans[0]?.name).toBe('GET localhost');
            expect(requestSpans[0]?.attributes[URL_FULL]).toEqual({ type: 'string', value: `${SERVER_URL}/pass` });
          },
        })
        .start();
      runner.makeRequest('get', '/testRequest');

      await runner.completed();
      closeTestServer();
    });
  });

  test('ignores static asset requests by default', async () => {
    const runner = createRunner(__dirname, 'server-ignoreStaticAssets.js')
      .expect({
        span: container => {
          const segment = container.items.find(span => span.is_segment);
          expect(segment?.name).toBe('GET /test');
          expect(segment?.attributes[URL_FULL]?.value).toMatch(/\/test$/);
          expect(segment?.attributes[SENTRY_OP]).toEqual({ type: 'string', value: HTTP_SERVER });
          expect(segment?.status).toBe('ok');
        },
      })
      .start();

    // These should be ignored by default
    await runner.makeRequest('get', '/favicon.ico');
    await runner.makeRequest('get', '/robots.txt');
    await runner.makeRequest('get', '/assets/app.js');

    // This one should be traced
    await runner.makeRequest('get', '/test');

    await runner.completed();
  });

  test('traces static asset requests when ignoreStaticAssets is false', async () => {
    const runner = createRunner(__dirname, 'server-traceStaticAssets.js')
      .expect({
        span: container => {
          const segment = container.items.find(span => span.is_segment);
          expect(segment?.name).toBe('GET /favicon.ico');
          expect(segment?.attributes[URL_FULL]?.value).toMatch(/\/favicon.ico$/);
          expect(segment?.attributes[SENTRY_OP]).toEqual({ type: 'string', value: HTTP_SERVER });
          expect(segment?.status).toBe('ok');
        },
      })
      .start();

    await runner.makeRequest('get', '/favicon.ico');

    await runner.completed();
  });
});
