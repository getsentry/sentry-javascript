import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('hapi auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'GET /',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'http.route': '/',
          'http.method': 'GET',
          'hapi.type': 'router',
          'sentry.origin': 'auto.http.otel.hapi',
          'sentry.op': 'router.hapi',
        }),
        description: 'GET /',
        op: 'router.hapi',
        origin: 'auto.http.otel.hapi',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_ERROR_EVENT = {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Test Error',
        },
      ],
    },
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should auto-instrument `@hapi/hapi` package.', async () => {
      const runner = createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    test('should instrument plugin routes and server extensions.', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /plugin-route',
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: 'GET /plugin-route',
                op: 'plugin.hapi',
                origin: 'auto.http.otel.hapi',
                data: expect.objectContaining({
                  'http.route': '/plugin-route',
                  'hapi.type': 'plugin',
                  'hapi.plugin.name': 'testPlugin',
                  'sentry.op': 'plugin.hapi',
                  'sentry.origin': 'auto.http.otel.hapi',
                }),
              }),
              expect.objectContaining({
                description: 'ext - onPreResponse',
                op: 'server.ext.hapi',
                origin: 'auto.http.otel.hapi',
                data: expect.objectContaining({
                  'hapi.type': 'server.ext',
                  'server.ext.type': 'onPreResponse',
                  'sentry.op': 'server.ext.hapi',
                  'sentry.origin': 'auto.http.otel.hapi',
                }),
              }),
            ]),
          },
        })
        .start();
      runner.makeRequest('get', '/plugin-route');
      await runner.completed();
    });

    test('should handle returned plain errors in routes.', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /error',
          },
        })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/error', { expectError: true });
      await runner.completed();
    });

    test('should assign parameterized transactionName to error.', async () => {
      const runner = createRunner()
        .expect({
          event: {
            ...EXPECTED_ERROR_EVENT,
            transaction: 'GET /error/{id}',
          },
        })
        .ignore('transaction')
        .start();
      runner.makeRequest('get', '/error/123', { expectError: true });
      await runner.completed();
    });

    test('should handle returned Boom errors in routes.', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /boom-error',
          },
        })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/boom-error', { expectError: true });
      await runner.completed();
    });

    test('should handle promise rejections in routes.', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /promise-error',
          },
        })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/promise-error', { expectError: true });
      await runner.completed();
    });
  });
});
