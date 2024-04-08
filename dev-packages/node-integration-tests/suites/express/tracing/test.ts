import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express tracing experimental', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('should create and send transactions for Express routes and spans for middlewares.', done => {
      createRunner(__dirname, 'server.js')
        .ignore('session', 'sessions')
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
                description: 'middleware - corsMiddleware',
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
        .ignore('session', 'sessions')
        .expect({
          transaction: {
            transaction: 'GET /',
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
      'should set a correct transaction name for routes consisting of arrays of routes',
      ((segment: string, done: () => void) => {
        createRunner(__dirname, 'server.js')
          .ignore('session', 'sessions')
          .expect({
            transaction: {
              transaction: 'GET /',
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
    ])('should handle more complex regexes in route arrays correctly', ((segment: string, done: () => void) => {
      createRunner(__dirname, 'server.js')
        .ignore('session', 'sessions')
        .expect({
          transaction: {
            transaction: 'GET /',
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
  });
});
