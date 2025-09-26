import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('hono tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    describe.each(['/sync', '/async'] as const)('when using %s route', route => {
      describe.each(['get', 'post', 'put', 'delete', 'patch'] as const)('when using %s method', method => {
        describe.each(['/', '/all', '/on'])('when using %s path', path => {
          test('should handle transaction', async () => {
            const runner = createRunner()
              .expect({
                transaction: {
                  transaction: `${method.toUpperCase()} ${route}${path === '/' ? '' : path}`,
                  spans: expect.arrayContaining([
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'sentryRequestMiddleware',
                        'hono.type': 'middleware',
                      }),
                      description: 'sentryRequestMiddleware',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'sentryErrorMiddleware',
                        'hono.type': 'middleware',
                      }),
                      description: 'sentryErrorMiddleware',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'global',
                        'hono.type': 'middleware',
                      }),
                      description: 'global',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'base',
                        'hono.type': 'middleware',
                      }),
                      description: 'base',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': `${route}${path === '/' ? '' : path}`,
                        'hono.type': 'request_handler',
                      }),
                      description: `${route}${path === '/' ? '' : path}`,
                      op: 'request_handler.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                  ]),
                },
              })
              .start();
            runner.makeRequest(method, `${route}${path === '/' ? '' : path}`);
            await runner.completed();
          });

          test('should handle transaction with anonymous middleware', async () => {
            const runner = createRunner()
              .expect({
                transaction: {
                  transaction: `${method.toUpperCase()} ${route}${path === '/' ? '' : path}/middleware`,
                  spans: expect.arrayContaining([
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'sentryRequestMiddleware',
                        'hono.type': 'middleware',
                      }),
                      description: 'sentryRequestMiddleware',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'sentryErrorMiddleware',
                        'hono.type': 'middleware',
                      }),
                      description: 'sentryErrorMiddleware',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'global',
                        'hono.type': 'middleware',
                      }),
                      description: 'global',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'base',
                        'hono.type': 'middleware',
                      }),
                      description: 'base',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'anonymous',
                        'hono.type': 'middleware',
                      }),
                      description: 'anonymous',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': `${route}${path === '/' ? '' : path}/middleware`,
                        'hono.type': 'request_handler',
                      }),
                      description: `${route}${path === '/' ? '' : path}/middleware`,
                      op: 'request_handler.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                  ]),
                },
              })
              .start();
            runner.makeRequest(method, `${route}${path === '/' ? '' : path}/middleware`);
            await runner.completed();
          });

          test('should handle transaction with separate middleware', async () => {
            const runner = createRunner()
              .expect({
                transaction: {
                  transaction: `${method.toUpperCase()} ${route}${path === '/' ? '' : path}/middleware/separately`,
                  spans: expect.arrayContaining([
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'sentryRequestMiddleware',
                        'hono.type': 'middleware',
                      }),
                      description: 'sentryRequestMiddleware',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'sentryErrorMiddleware',
                        'hono.type': 'middleware',
                      }),
                      description: 'sentryErrorMiddleware',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'global',
                        'hono.type': 'middleware',
                      }),
                      description: 'global',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'base',
                        'hono.type': 'middleware',
                      }),
                      description: 'base',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': 'anonymous',
                        'hono.type': 'middleware',
                      }),
                      description: 'anonymous',
                      op: 'middleware.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                    expect.objectContaining({
                      data: expect.objectContaining({
                        'hono.name': `${route}${path === '/' ? '' : path}/middleware/separately`,
                        'hono.type': 'request_handler',
                      }),
                      description: `${route}${path === '/' ? '' : path}/middleware/separately`,
                      op: 'request_handler.hono',
                      origin: 'auto.http.otel.hono',
                    }),
                  ]),
                },
              })
              .start();
            runner.makeRequest(method, `${route}${path === '/' ? '' : path}/middleware/separately`);
            await runner.completed();
          });

          test('should handle returned errors for %s path', async () => {
            const runner = createRunner()
              .ignore('transaction')
              .expect({
                event: {
                  exception: {
                    values: [
                      {
                        mechanism: {
                          type: 'auto.middleware.hono',
                          handled: false,
                        },
                        type: 'Error',
                        value: 'response 500',
                      },
                    ],
                  },
                },
              })
              .start();
            runner.makeRequest(method, `${route}${path === '/' ? '' : path}/500`, { expectError: true });
            await runner.completed();
          });

          test.each(['/401', '/402', '/403', '/does-not-exist'])(
            'should ignores error %s path by default',
            async (subPath: string) => {
              const runner = createRunner()
                .expect({
                  transaction: {
                    transaction: `${method.toUpperCase()} ${route}`,
                  },
                })
                .start();
              runner.makeRequest(method, `${route}${path === '/' ? '' : path}${subPath}`, { expectError: true });
              runner.makeRequest(method, route);
              await runner.completed();
            },
          );
        });
      });
    });
  });
});
