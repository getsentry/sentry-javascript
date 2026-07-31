import { afterAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('hapi auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  // `createEsmAndCjsTests` auto-runs this suite with orchestrion on CI. The
  // orchestrion path keeps span ops/attributes identical to the OTel path; only
  // the origin differs to signal the injection mechanism, so we branch on
  // `isOrchestrionEnabled()`.
  const origin = isOrchestrionEnabled() ? 'auto.http.hapi' : 'auto.http.otel.hapi';

  const EXPECTED_TRANSACTION = {
    transaction: 'GET /',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'http.route': '/',
          'http.method': 'GET',
          'hapi.type': 'router',
          'sentry.origin': origin,
          'sentry.op': 'router.hapi',
        }),
        description: 'GET /',
        op: 'router.hapi',
        origin,
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
                op: 'function',
                origin,
                data: expect.objectContaining({
                  'http.route': '/plugin-route',
                  'hapi.type': 'plugin',
                  'hapi.plugin.name': 'testPlugin',
                  'sentry.op': 'function',
                  'sentry.origin': origin,
                }),
              }),
              expect.objectContaining({
                description: 'ext - onPreResponse',
                op: 'server.ext.hapi',
                origin,
                data: expect.objectContaining({
                  'hapi.type': 'server.ext',
                  'server.ext.type': 'onPreResponse',
                  'sentry.op': 'server.ext.hapi',
                  'sentry.origin': origin,
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
