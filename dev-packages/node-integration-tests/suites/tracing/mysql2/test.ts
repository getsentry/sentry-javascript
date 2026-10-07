import {
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('mysql2 auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // With orchestrion injection enabled (`INJECT_ORCHESTRION`), the diagnostics-channel integration
  // records the spans instead of the OTel patcher, so they carry a different `sentry.origin`.
  const ORIGIN = 'auto.db.mysql2';

  const EXPECTED_SPANS = {
    items: expect.arrayContaining([
      expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
          [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? + ? AS solution' },
          [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
          [SERVER_PORT]: { type: 'integer', value: 3344 },
          [DB_USER]: { type: 'string', value: 'root' },
          [SENTRY_OP]: { type: 'string', value: 'db' },
          [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        }),
        name: 'SELECT',
      }),
      // bind values are left as `?` placeholders in `db.statement` (not inlined)
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
          [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? as a, ? as b, NOW() as c' },
          [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
          [SERVER_PORT]: { type: 'integer', value: 3344 },
          [DB_USER]: { type: 'string', value: 'root' },
          [SENTRY_OP]: { type: 'string', value: 'db' },
          [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        }),
        name: 'SELECT',
      }),
      // a single non-array bind value is also left as a `?` placeholder in `db.statement`
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
          [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS scalar_value' },
          [SENTRY_OP]: { type: 'string', value: 'db' },
          [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        }),
        name: 'SELECT',
      }),
      // `execute` is instrumented the same way as `query`
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
          [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS answer' },
          [SENTRY_OP]: { type: 'string', value: 'db' },
          [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        }),
        name: 'SELECT',
      }),
      // a failing query produces a span with an error status
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
          [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM does_not_exist' },
          [SENTRY_OP]: { type: 'string', value: 'db' },
          [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        }),
        name: 'SELECT does_not_exist',
        status: 'error',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('should auto-instrument `mysql2` package without connection.connect()', { timeout: 75_000 }, async () => {
        await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
      });
    },
    // mysql2 >= 3.20.0 publishes its own diagnostics channels, which the SDK subscribes to instead
    // of the orchestrion path asserted here. That range is covered by `mysql2-tracing-channel`, so
    // this suite pins a version below the boundary regardless of the version the workspace installs.
    { additionalDependencies: { mysql2: '3.19.1' } },
  );
});
