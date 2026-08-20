import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

// mysql2 >= 3.20.0 publishes its operations via `node:diagnostics_channel`, so the SDK subscribes
// to those channels (`subscribeMysql2DiagnosticChannels`) instead of monkey-patching. This suite
// pins `^3.20.0` and asserts the diagnostics-channel path: stable OTel DB semconv attributes,
// redacted query text, and that the legacy IITM patcher (gated to `< 3.20.0`) does NOT also fire.
describe('mysql2 tracing channel Test', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const expectedQuerySpan = (queryText: string) =>
    expect.objectContaining({
      description: queryText,
      op: 'db',
      origin: 'auto.db.mysql2.diagnostic_channel',
      data: expect.objectContaining({
        'sentry.origin': 'auto.db.mysql2.diagnostic_channel',
        'db.system.name': 'mysql',
        'db.operation.name': 'SELECT',
        'db.query.text': queryText,
        'server.address': 'localhost',
        'server.port': 3308,
      }),
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expectedQuerySpan('SELECT ? + ? AS solution'),
      // the inlined literal is redacted out of `db.query.text`
      expectedQuerySpan('SELECT ? AS leaked'),
      // `execute` keeps the `?` placeholder
      expectedQuerySpan('SELECT ? AS answer'),
      // a failing query produces a span with an error status
      expect.objectContaining({
        description: 'SELECT * FROM does_not_exist',
        op: 'db',
        status: 'internal_error',
        origin: 'auto.db.mysql2.diagnostic_channel',
      }),
    ]),
  };

  describeWithDockerCompose('with pg docker compose', { workingDirectory: [__dirname] }, () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('subscribes to mysql2 >= 3.20.0 diagnostics channels with stable semconv attributes', async () => {
          await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
        }, 30_000);

        test('does not double-instrument: the legacy IITM mysql2 patcher does not fire on 3.20.0+', async () => {
          await createTestRunner()
            .expect({
              transaction: event => {
                expect(event.transaction).toBe('Test Transaction');
                const spans = event.spans || [];
                // The monkey-patch path (origin `auto.db.otel.mysql2`) must be inactive on 3.20.0+.
                expect(spans.find(span => span.origin === 'auto.db.otel.mysql2')).toBeUndefined();
                // ...while the diagnostics-channel path is active.
                expect(spans.find(span => span.origin === 'auto.db.mysql2.diagnostic_channel')).toBeDefined();
              },
            })
            .start()
            .completed();
        }, 30_000);

        test('never leaks raw values into db.query.text', async () => {
          await createTestRunner()
            .expect({
              transaction: event => {
                expect(event.transaction).toBe('Test Transaction');
                const spans = event.spans || [];
                for (const span of spans) {
                  const queryText = span.data?.['db.query.text'];
                  if (typeof queryText === 'string') {
                    expect(queryText).not.toContain('super-secret');
                  }
                }
              },
            })
            .start()
            .completed();
        }, 30_000);
      },
      { additionalDependencies: { mysql2: '^3.20.0' } },
    );
  });
});
