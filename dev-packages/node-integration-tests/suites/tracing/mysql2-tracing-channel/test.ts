import {
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

// mysql2 >= 3.20.0 publishes its operations via `node:diagnostics_channel`, so the SDK subscribes
// to those channels (`subscribeMysql2DiagnosticChannels`) instead of monkey-patching. This suite
// runs against the workspace version and asserts the diagnostics-channel path: stable OTel DB
// semconv attributes, redacted query text, and that the legacy IITM patcher (gated to `< 3.20.0`)
// does NOT also fire. A workspace downgrade below 3.20.0 fails the double-instrumentation test.
describe('mysql2 tracing channel Test', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const expectedQuerySpan = (queryText: string) =>
    expect.objectContaining({
      attributes: expect.objectContaining({
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.mysql2.native_channel' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
        [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
        [DB_QUERY_TEXT]: { type: 'string', value: queryText },
        [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
        [SERVER_PORT]: { type: 'integer', value: 3308 },
        [SENTRY_OP]: { type: 'string', value: DB },
      }),
      name: 'SELECT',
    });

  const EXPECTED_SPANS = {
    items: expect.arrayContaining([
      expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
      expectedQuerySpan('SELECT ? + ? AS solution'),
      // the inlined literal is redacted out of `db.query.text`
      expectedQuerySpan('SELECT ? AS leaked'),
      // `execute` keeps the `?` placeholder
      expectedQuerySpan('SELECT ? AS answer'),
      // a failing query produces a span with an error status
      expect.objectContaining({
        attributes: expect.objectContaining({
          [SENTRY_OP]: { type: 'string', value: DB },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.mysql2.native_channel' },
          [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM does_not_exist' },
        }),
        name: 'SELECT does_not_exist',
        status: 'error',
      }),
    ]),
  };

  describeWithDockerCompose('with pg docker compose', { workingDirectory: [__dirname] }, () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('records mysql2 channel spans without double-instrumentation or leaking raw values', async () => {
        const runner = createTestRunner();
        const spansPromise = runner.collectStreamedSpans(
          spans =>
            spans.some(span => span.is_segment && span.name === 'Test Transaction') &&
            spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mysql2.native_channel').length >= 4,
        );
        await runner.start().completed();
        const container = { items: await spansPromise };
        {
          expect(container).toMatchObject(EXPECTED_SPANS);
        }
        {
          expect(container.items.find(span => span.is_segment)?.name).toBe('Test Transaction');
          const spans = container.items.filter(span => !span.is_segment);
          // The monkey-patch path (origin `auto.db.mysql2`) must be inactive on 3.20.0+.
          expect(spans.find(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mysql2')).toBeUndefined();
          // ...while the diagnostics-channel path is active.
          expect(
            spans.find(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mysql2.native_channel'),
          ).toBeDefined();
        }
        {
          expect(container.items.find(span => span.is_segment)?.name).toBe('Test Transaction');
          const spans = container.items.filter(span => !span.is_segment);
          for (const span of spans) {
            const queryText = span.attributes[DB_QUERY_TEXT]?.value;
            if (typeof queryText === 'string') {
              expect(queryText).not.toContain('super-secret');
            }
          }
        }
      }, 30_000);
    });
  });
});
