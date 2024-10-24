import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('httpIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('allows to pass instrumentation options to integration', done => {
    // response shape seems different on Node 14, so we skip this there
    const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
    if (nodeMajorVersion <= 14) {
      done();
      return;
    }

    createRunner(__dirname, 'server.js')
      .expect({
        transaction: {
          contexts: {
            trace: {
              span_id: expect.any(String),
              trace_id: expect.any(String),
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
      .start(done)
      .makeRequest('get', '/test');
  });

  test('allows to pass experimental config through to integration', done => {
    createRunner(__dirname, 'server-experimental.js')
      .expect({
        transaction: {
          contexts: {
            trace: {
              span_id: expect.any(String),
              trace_id: expect.any(String),
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
      .start(done)
      .makeRequest('get', '/test');
  });

  describe("doesn't create a root span for incoming requests ignored via `ignoreIncomingRequests`", () => {
    test('via the url param', done => {
      const runner = createRunner(__dirname, 'server-ignoreIncomingRequests.js')
        .expect({
          transaction: {
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
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
        .start(done);

      runner.makeRequest('get', '/liveness'); // should be ignored
      runner.makeRequest('get', '/test');
    });

    test('via the request param', done => {
      const runner = createRunner(__dirname, 'server-ignoreIncomingRequests.js')
        .expect({
          transaction: {
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
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
        .start(done);

      runner.makeRequest('post', '/readiness'); // should be ignored
      runner.makeRequest('get', '/test');
    });
  });

  describe("doesn't create child spans or breadcrumbs for outgoing requests ignored via `ignoreOutgoingRequests`", () => {
    test('via the url param', done => {
      const runner = createRunner(__dirname, 'server-ignoreOutgoingRequests.js')
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('GET /testUrl');

            const requestSpans = event.spans?.filter(span => span.op === 'http.client');
            expect(requestSpans).toHaveLength(1);
            expect(requestSpans![0]?.description).toBe('GET http://example.com/pass');

            const breadcrumbs = event.breadcrumbs?.filter(b => b.category === 'http');
            expect(breadcrumbs).toHaveLength(1);
            expect(breadcrumbs![0]?.data?.url).toEqual('http://example.com/pass');
          },
        })
        .start(done);

      runner.makeRequest('get', '/testUrl');
    });

    test('via the request param', done => {
      const runner = createRunner(__dirname, 'server-ignoreOutgoingRequests.js')
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('GET /testRequest');

            const requestSpans = event.spans?.filter(span => span.op === 'http.client');
            expect(requestSpans).toHaveLength(1);
            expect(requestSpans![0]?.description).toBe('GET http://example.com/pass');

            const breadcrumbs = event.breadcrumbs?.filter(b => b.category === 'http');
            expect(breadcrumbs).toHaveLength(1);
            expect(breadcrumbs![0]?.data?.url).toEqual('http://example.com/pass');
          },
        })
        .start(done);

      runner.makeRequest('get', '/testRequest');
    });
  });
});
