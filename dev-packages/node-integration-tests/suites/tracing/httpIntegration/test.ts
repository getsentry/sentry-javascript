import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

describe('httpIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
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
  });

  test('allows to pass experimental config through to integration', async () => {
    const runner = createRunner(__dirname, 'server-experimental.js')
      .expect({
        transaction: {
          contexts: {
            trace: {
              span_id: expect.stringMatching(/[a-f0-9]{16}/),
              trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              data: {
                url: expect.stringMatching(/\/test$/),
                'http.response.status_code': 200,
                'http.server_name': 'sentry-test-server-name',
              },
              op: 'http.server',
              status: 'ok',
            },
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test');
    await runner.completed();
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
});
