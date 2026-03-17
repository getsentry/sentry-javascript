import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../utils/runner';

describe('hono-sdk (Node)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates a transaction for a basic GET request', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /',
            contexts: {
              trace: {
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

    test('creates a transaction with a parametrized route name', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /hello/:name',
            transaction_info: {
              source: 'route',
            },
            contexts: {
              trace: {
                op: 'http.server',
                status: 'ok',
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/hello/world');
      await runner.completed();
    });

    test('captures an error with the correct mechanism', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'Test error from Hono app',
                  mechanism: {
                    type: 'auto.http.hono.context_error',
                    handled: false,
                  },
                },
              ],
            },
            transaction: 'GET /error/:param',
          },
        })
        .start();
      runner.makeRequest('get', '/error/param-123', { expectError: true });
      await runner.completed();
    });

    test('creates a transaction with internal_error status when an error occurs', async () => {
      const runner = createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'GET /error/:param',
            contexts: {
              trace: {
                op: 'http.server',
                status: 'internal_error',
                data: expect.objectContaining({
                  'http.response.status_code': 500,
                }),
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/error/param-456', { expectError: true });
      await runner.completed();
    });
  });
});
