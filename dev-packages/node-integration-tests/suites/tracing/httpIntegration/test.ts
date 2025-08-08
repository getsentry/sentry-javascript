import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

describe('httpIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('instrumentation options', () => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument-options.mjs', (createRunner, test) => {
      test('allows to pass instrumentation options to integration', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              contexts: {
                trace: {
                  span_id: expect.stringMatching(/[a-f0-9]{16}/),
                  trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                  data: {
                    url: expect.stringMatching(/\/test$/),
                    'http.response.status_code': 200,
                    attr1: 'yes',
                    attr2: 'yes',
                    attr3: 'yes',
                  },
                  op: 'http.server',
                  status: 'ok',
                },
              },
              extra: {
                requestHookCalled: {
                  url: expect.stringMatching(/\/test$/),
                  method: 'GET',
                },
                responseHookCalled: {
                  url: expect.stringMatching(/\/test$/),
                  method: 'GET',
                },
                applyCustomAttributesOnSpanCalled: {
                  reqUrl: expect.stringMatching(/\/test$/),
                  reqMethod: 'GET',
                  resUrl: expect.stringMatching(/\/test$/),
                  resMethod: 'GET',
                },
              },
            },
          })
          .start();
        runner.makeRequest('get', '/test');
        await runner.completed();
      });

      test('allows to configure incomingRequestSpanHook', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              contexts: {
                trace: {
                  span_id: expect.stringMatching(/[a-f0-9]{16}/),
                  trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                  data: {
                    url: expect.stringMatching(/\/test$/),
                    'http.response.status_code': 200,
                    incomingRequestSpanHook: 'yes',
                  },
                  op: 'http.server',
                  status: 'ok',
                },
              },
              extra: expect.objectContaining({
                incomingRequestSpanHookCalled: {
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

  describe('http.server spans', () => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
      test('captures correct attributes for GET requests', async () => {
        const runner = createRunner()
          .expect({
            transaction: transaction => {
              const port = runner.getPort();
              expect(transaction.transaction).toBe('GET /test');
              expect(transaction.contexts?.trace?.data).toEqual({
                'http.flavor': '1.1',
                'http.host': `localhost:${port}`,
                'http.method': 'GET',
                'http.query': 'a=1&b=2',
                'http.response.status_code': 200,
                'http.route': '/test',
                'http.scheme': 'http',
                'http.status_code': 200,
                'http.status_text': 'OK',
                'http.target': '/test?a=1&b=2',
                'http.url': `http://localhost:${port}/test?a=1&b=2`,
                'http.user_agent': 'node',
                'net.host.ip': '::1',
                'net.host.name': 'localhost',
                'net.host.port': port,
                'net.peer.ip': '::1',
                'net.peer.port': expect.any(Number),
                'net.transport': 'ip_tcp',
                'otel.kind': 'SERVER',
                'sentry.op': 'http.server',
                'sentry.origin': 'auto.http.otel.http',
                'sentry.sample_rate': 1,
                'sentry.source': 'route',
                url: `http://localhost:${port}/test`,
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
                'http.flavor': '1.1',
                'http.host': `localhost:${port}`,
                'http.method': 'POST',
                'http.query': 'a=1&b=2',
                'http.request_content_length_uncompressed': 9,
                'http.response.status_code': 200,
                'http.route': '/test',
                'http.scheme': 'http',
                'http.status_code': 200,
                'http.status_text': 'OK',
                'http.target': '/test?a=1&b=2',
                'http.url': `http://localhost:${port}/test?a=1&b=2`,
                'http.user_agent': 'node',
                'net.host.ip': '::1',
                'net.host.name': 'localhost',
                'net.host.port': port,
                'net.peer.ip': '::1',
                'net.peer.port': expect.any(Number),
                'net.transport': 'ip_tcp',
                'otel.kind': 'SERVER',
                'sentry.op': 'http.server',
                'sentry.origin': 'auto.http.otel.http',
                'sentry.sample_rate': 1,
                'sentry.source': 'route',
                url: `http://localhost:${port}/test`,
              });
            },
          })
          .start();

        runner.makeRequest('post', '/test?a=1&b=2#hash', { data: 'test body' });
        await runner.completed();
      });
    });
  });

  describe("doesn't create a root span for incoming requests ignored via `ignoreIncomingRequests`", () => {
    test('via the url param', async () => {
      const runner = createRunner(__dirname, 'server-ignoreIncomingRequests.js')
        .expect({
          transaction: {
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                data: {
                  url: expect.stringMatching(/\/test$/),
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
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                data: {
                  url: expect.stringMatching(/\/test$/),
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
          expect(event.contexts?.trace?.data?.url).toMatch(/\/test$/);
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
          expect(event.contexts?.trace?.data?.url).toMatch(/\/favicon.ico$/);
          expect(event.contexts?.trace?.op).toBe('http.server');
          expect(event.contexts?.trace?.status).toBe('ok');
        },
      })
      .start();

    await runner.makeRequest('get', '/favicon.ico');

    await runner.completed();
  });
});
