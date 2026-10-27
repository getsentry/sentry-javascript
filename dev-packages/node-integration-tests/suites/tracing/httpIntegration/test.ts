import { HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import { createTestServer } from '@sentry-internal/test-utils';
import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_RESPONSE_STATUS_TEXT,
  HTTP_ROUTE,
  NETWORK_LOCAL_ADDRESS,
  NETWORK_LOCAL_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  NETWORK_TRANSPORT,
  SENTRY_ENVIRONMENT,
  SENTRY_IS_LOCALHOST,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_RELEASE,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
  URL_PATH,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
  USER_IP_ADDRESS,
} from '@sentry/conventions/attributes';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';
import { EXPECTED_SDK_NAME, supports } from '../../../utils';

const LOOPBACK_ADDRESS = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/;

// Attributes from the context of the host (app, device, OS, culture, runtime, cloud). Which of them
// the SDK sends depends on the platform, so tests only check that they are well formed.
const HOST_CONTEXT_ATTRIBUTE = /^(app|device|os|culture|process\.runtime|cloud)\./;

function splitHostContextAttributes(attributes: Record<string, unknown>): {
  hostContext: Record<string, unknown>;
  rest: Record<string, unknown>;
} {
  const hostContext: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    (HOST_CONTEXT_ATTRIBUTE.test(key) ? hostContext : rest)[key] = value;
  }
  return { hostContext, rest };
}

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

  describe('onSpanCreated and onSpanEnd options', () => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument-options.mjs', (createRunner, test) => {
      test('allows to configure onSpanCreated and onSpanEnd', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              const segmentSpan = container.items.find(span => span.is_segment);
              expect(segmentSpan).toEqual(
                expect.objectContaining({
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
                  status: 'ok',
                }),
              );

              // Every other attribute is listed, so the test fails when the span gets a new one.
              const { hostContext, rest } = splitHostContextAttributes(segmentSpan!.attributes);
              expect(rest).toEqual({
                onSpanCreated: { type: 'string', value: 'yes' },
                'onSpanCreated.reqUrl': { type: 'string', value: '/test' },
                'onSpanCreated.reqMethod': { type: 'string', value: 'GET' },
                'onSpanCreated.resUrl': { type: 'string', value: '/test' },
                'onSpanCreated.resMethod': { type: 'string', value: 'GET' },
                'onSpanEnd.reqUrl': { type: 'string', value: '/test' },
                'onSpanEnd.resStatusCode': { type: 'integer', value: 200 },
                [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.http_server' },
                [SENTRY_KIND]: { type: 'string', value: 'server' },
                [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan!.span_id },
                [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET /test' },
                [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'route' },
                [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
                [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
                [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
                [SENTRY_RELEASE]: { type: 'string', value: '1.0' },
                [SENTRY_SDK_NAME]: { type: 'string', value: EXPECTED_SDK_NAME },
                [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
                [SENTRY_SDK_INTEGRATIONS]: { type: 'array', value: expect.arrayContaining(['Http']) },
                [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
                [HTTP_ROUTE]: { type: 'string', value: '/test' },
                [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                [HTTP_RESPONSE_STATUS_TEXT]: { type: 'string', value: 'OK' },
                [URL_FULL]: { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:\d+\/test$/) },
                [URL_PATH]: { type: 'string', value: '/test' },
                [URL_SCHEME]: { type: 'string', value: 'http' },
                [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
                [SERVER_PORT]: { type: 'integer', value: expect.any(Number) },
                [CLIENT_ADDRESS]: { type: 'string', value: expect.stringMatching(LOOPBACK_ADDRESS) },
                [CLIENT_PORT]: { type: 'integer', value: expect.any(Number) },
                [USER_IP_ADDRESS]: { type: 'string', value: expect.stringMatching(LOOPBACK_ADDRESS) },
                [NETWORK_LOCAL_ADDRESS]: { type: 'string', value: expect.stringMatching(LOOPBACK_ADDRESS) },
                [NETWORK_LOCAL_PORT]: { type: 'integer', value: expect.any(Number) },
                [NETWORK_PEER_ADDRESS]: { type: 'string', value: expect.stringMatching(LOOPBACK_ADDRESS) },
                [NETWORK_PEER_PORT]: { type: 'integer', value: expect.any(Number) },
                [NETWORK_PROTOCOL_NAME]: { type: 'string', value: 'http' },
                [NETWORK_PROTOCOL_VERSION]: { type: 'string', value: '1.1' },
                [NETWORK_TRANSPORT]: { type: 'string', value: 'tcp' },
                [USER_AGENT_ORIGINAL]: { type: 'string', value: 'node' },
                'http.request.header.accept': { type: 'array', value: ['*/*'] },
                'http.request.header.accept-encoding': { type: 'array', value: ['gzip, deflate'] },
                'http.request.header.accept-language': { type: 'array', value: ['*'] },
                'http.request.header.connection': { type: 'array', value: ['keep-alive'] },
                'http.request.header.host': { type: 'array', value: [expect.stringMatching(/^localhost:\d+$/)] },
                'http.request.header.sec-fetch-mode': { type: 'array', value: ['cors'] },
                'http.request.header.user-agent': { type: 'array', value: ['node'] },
              });
              for (const attribute of Object.values(hostContext)) {
                expect(attribute).toEqual({ type: expect.any(String), value: expect.anything() });
              }
            },
          })
          .start();
        runner.makeRequest('get', '/test');
        await runner.completed();
      });
    });
  });

  describe('user callbacks that throw', () => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument-throwing-callbacks.mjs', (createRunner, test) => {
      test('still handles requests and sends the span when `onSpanCreated`, `onSpanEnd` and `ignoreIncomingRequests` throw', async () => {
        const runner = createRunner()
          .expect({
            span: {
              items: expect.arrayContaining([
                expect.objectContaining({
                  is_segment: true,
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

        expect(await runner.makeRequest('get', '/test')).toEqual({ response: 'response 1' });
        expect(await runner.makeRequest('post', '/test')).toEqual({ response: 'response 2' });
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
            const attributes = clientSpans[0]?.attributes;
            expect(attributes?.['outgoingRequestHook']).toEqual({ type: 'string', value: 'GET' });
            expect(attributes?.['outgoingResponseHook']).toEqual({ type: 'integer', value: 200 });
            expect(attributes?.['outgoingRequestApplyCustomAttributes']).toEqual({ type: 'string', value: 'GET 200' });
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
    describe.runIf(supports({ runtimes: ['node', 'bun'] }))('custom server.emit', () => {
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

    // Flush so any static-asset span fails the expectation before /test runs.
    await runner.makeRequest('get', '/flush');

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
