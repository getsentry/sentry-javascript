import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../utils/runner';

describe('vercel', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should flush spans correctly on Vercel', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /test/express',
          },
        })
        .start();
      runner.makeRequest('get', '/test/express');
      await runner.completed();

      const actualLogs = runner.getLogs();

      // We want to test that the following logs are present in this order
      // other logs may be in between
      const expectedLogs = [
        'Sentry Logger [log]: @sentry/instrumentation-http Patching server.emit',
        'Sentry Logger [log]: @sentry/instrumentation-http Handling incoming request',
        'Sentry Logger [log]: @sentry/instrumentation-http Patching request.on',
        'Sentry Logger [debug]: @opentelemetry_sentry-patched/instrumentation-http http instrumentation incomingRequest',
        'Sentry Logger [log]: [Tracing] Starting sampled root span',
        // later...
        'Sentry Logger [log]: Patching response to flush on Vercel',
        'Sentry Logger [log]: Patching res.end()',
        // later...
        'Sentry Logger [log]: Flushing events before Vercel Lambda freeze',
        'Sentry Logger [log]: SpanExporter exported 4 spans, 0 spans are waiting for their parent spans to finish',
      ];

      // Test that the order of logs is correct
      for (const log of actualLogs) {
        if (expectedLogs.length === 0) {
          break;
        }

        if (log === expectedLogs[0]) {
          expectedLogs.shift();
        }
      }

      if (expectedLogs.length > 0) {
        // eslint-disable-next-line no-console
        console.log(actualLogs);
        expect(expectedLogs).toEqual([]);
      }
    });

    test('should flush errors correctly on Vercel', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /test/error',
          },
        })
        .expect({
          event: {
            transaction: 'GET /test/error',
            exception: {
              values: [
                {
                  value: 'test error',
                },
              ],
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test/error', { expectError: true });
      await runner.completed();

      const actualLogs = runner.getLogs();

      // We want to test that the following logs are present in this order
      // other logs may be in between
      const expectedLogs = [
        'Sentry Logger [log]: @sentry/instrumentation-http Patching server.emit',
        'Sentry Logger [log]: @sentry/instrumentation-http Handling incoming request',
        'Sentry Logger [log]: @sentry/instrumentation-http Patching request.on',
        'Sentry Logger [debug]: @opentelemetry_sentry-patched/instrumentation-http http instrumentation incomingRequest',
        'Sentry Logger [log]: [Tracing] Starting sampled root span',
        // later...
        'Sentry Logger [log]: Patching response to flush on Vercel',
        'Sentry Logger [log]: Patching res.end()',
        // later...
        'Sentry Logger [log]: Captured error event `test error`',
        // later...
        'Sentry Logger [log]: Flushing events before Vercel Lambda freeze',
        'Sentry Logger [log]: SpanExporter exported 4 spans, 0 spans are waiting for their parent spans to finish',
      ];

      // Test that the order of logs is correct
      for (const log of actualLogs) {
        if (expectedLogs.length === 0) {
          break;
        }

        if (log === expectedLogs[0]) {
          expectedLogs.shift();
        }
      }

      if (expectedLogs.length > 0) {
        // eslint-disable-next-line no-console
        console.log(actualLogs);
        expect(expectedLogs).toEqual([]);
      }
    });
  });

  describe('without http.server spans', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutSpans.mjs',
      'instrument-withoutSpans.mjs',
      (createRunner, test) => {
        test('should flush errors correctly on Vercel even without HTTP span instrumentation', async () => {
          const runner = createRunner()
            .expect({
              event: {
                transaction: 'GET /test/error',
                exception: {
                  values: [
                    {
                      value: 'test error',
                    },
                  ],
                },
              },
            })
            .start();
          runner.makeRequest('get', '/test/error', { expectError: true });
          await runner.completed();

          const actualLogs = runner.getLogs();

          // We want to test that the following logs are present in this order
          // other logs may be in between
          const expectedLogs = [
            'Sentry Logger [log]: @sentry/instrumentation-http Patching server.emit',
            'Sentry Logger [log]: Patching response to flush on Vercel',
            'Sentry Logger [log]: Patching res.end()',
            'Sentry Logger [log]: @sentry/instrumentation-http Handling incoming request',
            'Sentry Logger [log]: @sentry/instrumentation-http Patching request.on',
            // later...
            'Sentry Logger [log]: Captured error event `test error`',
            // later...
            'Sentry Logger [log]: Flushing events before Vercel Lambda freeze',
            'Sentry Logger [log]: SpanExporter exported 0 spans, 0 spans are waiting for their parent spans to finish',
          ];

          // Test that the order of logs is correct
          for (const log of actualLogs) {
            if (expectedLogs.length === 0) {
              break;
            }

            if (log === expectedLogs[0]) {
              expectedLogs.shift();
            }
          }

          if (expectedLogs.length > 0) {
            // eslint-disable-next-line no-console
            console.log(actualLogs);
            expect(expectedLogs).toEqual([]);
          }
        });
      },
    );
  });
});
