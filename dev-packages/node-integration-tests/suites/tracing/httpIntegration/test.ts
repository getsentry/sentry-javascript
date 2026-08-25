import { createTestServer } from '@sentry-internal/test-utils';
import { URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';

function getCommonHttpRequestHeaders(): Record<string, unknown> {
  return {
    'http.request.header.accept': '*/*',
    'http.request.header.accept_encoding': 'gzip, deflate',
    'http.request.header.accept_language': '*',
    'http.request.header.connection': 'keep-alive',
    'http.request.header.host': expect.any(String),
    'http.request.header.sec_fetch_mode': 'cors',
    'http.request.header.user_agent': 'node',
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
            transaction: {
              contexts: {
                trace: {
                  span_id: expect.stringMatching(/[a-f\d]{16}/),
                  trace_id: expect.stringMatching(/[a-f\d]{32}/),
                  data: {
                    'url.full': expect.stringMatching(/\/test$/),
                    'http.response.status_code': 200,
                    onSpanCreated: 'yes',
                  },
                  op: 'http.server',
                  status: 'ok',
                },
              },
              extra: expect.objectContaining({
                onSpanCreatedCalled: {
                  reqUrl: expect.stringMatching(/\/test$/),
                  reqMethod: 'GET',
                  resUrl: expect.stringMatching(/\/test$/),
                  resMethod: 'GET',
                },
              }),
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
          transaction: event => {
            const clientSpans = event.spans?.filter(span => span.op === 'http.client');
            expect(clientSpans).toHaveLength(1);

            // All three hooks run before the span ends, so every attribute has to survive to the envelope.
            const data = clientSpans![0]?.data;
            expect(data?.['outgoingRequestHook']).toBe('GET');
            expect(data?.['outgoingResponseHook']).toBe(200);
            expect(data?.['outgoingRequestApplyCustomAttributes']).toBe('GET 200');
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
                'sentry.origin': 'auto.http.otel.http',
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
                'sentry.origin': 'auto.http.otel.http',
                'sentry.sample_rate': 1,
                'sentry.segment.name.source': 'route',
                [URL_FULL]: `http://localhost:${port}/test?a=1&b=2`,
                [URL_PATH]: '/test',
                'http.request.header.content_length': '9',
                'http.request.header.content_type': 'text/plain;charset=UTF-8',
                ...getCommonHttpRequestHeaders(),
              });
            },
          })
          .start();

        runner.makeRequest('post', '/test?a=1&b=2#hash', { data: 'test body' });
        await runner.completed();
      });
    });

    describe('custom server.emit', () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario-overwrite-server-emit.mjs',
        'instrument-overwrite-server-emit.mjs',
        (createRunner, test) => {
          test('handles server.emit being overwritten via classic monkey patching', async () => {
            const runner = createRunner()
              .expect({
                transaction: {
                  transaction: 'GET /test1',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test2',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test3',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
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
                transaction: {
                  transaction: 'GET /test1-proxy',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test2-proxy',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test3-proxy',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
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
                transaction: {
                  transaction: 'GET /test1-original',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test2-original',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test3-original',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
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
                transaction: {
                  transaction: 'GET /test1-proxy-original',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test2-proxy-original',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
                },
              })
              .expect({
                transaction: {
                  transaction: 'GET /test3-proxy-original',
                  contexts: {
                    trace: {
                      span_id: expect.stringMatching(/[a-f\d]{16}/),
                      trace_id: expect.stringMatching(/[a-f\d]{32}/),
                      data: {
                        'http.response.status_code': 200,
                        'sentry.op': 'http.server',
                      },
                    },
                  },
                  spans: [],
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
          transaction: {
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f\d]{16}/),
                trace_id: expect.stringMatching(/[a-f\d]{32}/),
                data: {
                  'url.full': expect.stringMatching(/\/test$/),
                  'http.response.status_code': 200,
                },
                op: 'http.server',
                status: 'ok',
              },
            },
            transaction: 'GET /test',
          },
        })
        .start();

      runner.makeRequest('get', '/liveness'); // should be ignored
      runner.makeRequest('get', '/test');
      await runner.completed();
    });

    test('via the request param', async () => {
      const runner = createRunner(__dirname, 'server-ignoreIncomingRequests.js')
        .expect({
          transaction: {
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f\d]{16}/),
                trace_id: expect.stringMatching(/[a-f\d]{32}/),
                data: {
                  'url.full': expect.stringMatching(/\/test$/),
                  'http.response.status_code': 200,
                },
                op: 'http.server',
                status: 'ok',
              },
            },
            transaction: 'GET /test',
          },
        })
        .start();

      runner.makeRequest('post', '/readiness'); // should be ignored
      runner.makeRequest('get', '/test');
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
          transaction: event => {
            expect(event.transaction).toBe('GET /testUrl');

            const requestSpans = event.spans?.filter(span => span.op === 'http.client');
            expect(requestSpans).toHaveLength(1);
            expect(requestSpans![0]?.description).toBe(`GET ${SERVER_URL}/pass`);

            const breadcrumbs = event.breadcrumbs?.filter(b => b.category === 'http');
            expect(breadcrumbs).toHaveLength(1);
            expect(breadcrumbs![0]?.data?.url).toEqual(`${SERVER_URL}/pass`);
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
          transaction: event => {
            expect(event.transaction).toBe('GET /testRequest');

            const requestSpans = event.spans?.filter(span => span.op === 'http.client');
            expect(requestSpans).toHaveLength(1);
            expect(requestSpans![0]?.description).toBe(`GET ${SERVER_URL}/pass`);

            const breadcrumbs = event.breadcrumbs?.filter(b => b.category === 'http');
            expect(breadcrumbs).toHaveLength(1);
            expect(breadcrumbs![0]?.data?.url).toEqual(`${SERVER_URL}/pass`);
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
        transaction: event => {
          expect(event.transaction).toBe('GET /test');
          expect(event.contexts?.trace?.data?.['url.full']).toMatch(/\/test$/);
          expect(event.contexts?.trace?.op).toBe('http.server');
          expect(event.contexts?.trace?.status).toBe('ok');
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
        transaction: event => {
          expect(event.transaction).toBe('GET /favicon.ico');
          expect(event.contexts?.trace?.data?.['url.full']).toMatch(/\/favicon.ico$/);
          expect(event.contexts?.trace?.op).toBe('http.server');
          expect(event.contexts?.trace?.status).toBe('ok');
        },
      })
      .start();

    await runner.makeRequest('get', '/favicon.ico');

    await runner.completed();
  });
});
