import {
  DB_CONNECTION_STRING,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_ENVIRONMENT,
  SENTRY_IS_LOCALHOST,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_RELEASE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';
import { startMysqlTestServer } from './mysql-test-server';

describe('mysql auto instrumentation', () => {
  // A minimal in-process MySQL server (on a random free port) so the client's
  // connection handshake succeeds. Without it, `createPool()` queries fail at
  // connection acquisition — before `connection.query` runs — so the
  // diagnostics-channel instrumentation (which hooks `connection.query`) never
  // sees them. The port is passed to each scenario via the `MYSQL_PORT` env var.
  let mysqlServer: Server;
  let mysqlPort: number;
  beforeAll(async () => {
    mysqlServer = startMysqlTestServer();
    await new Promise<void>(resolve => mysqlServer.once('listening', () => resolve()));
    mysqlPort = (mysqlServer.address() as AddressInfo).port;
  });

  afterAll(() => {
    mysqlServer?.close();
    cleanupChildProcesses();
  });

  function expectedSpans(
    port: number,
    origin: string | undefined,
    override: Record<string, unknown> | undefined,
  ): unknown {
    const COMMON_ATTRIBUTES = {
      // These spans belong to a script with no incoming request, so there is nothing to judge.
      [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: false },
      [DB_CONNECTION_STRING]: {
        type: 'string',
        value: expect.stringMatching(/^jdbc:mysql:\/\/localhost:.*/),
      },
      [DB_SYSTEM_NAME]: {
        type: 'string',
        value: 'mysql',
      },
      [DB_USER]: {
        type: 'string',
        value: 'root',
      },
      [SERVER_ADDRESS]: {
        type: 'string',
        value: 'localhost',
      },
      [SERVER_PORT]: {
        type: 'integer',
        value: port,
      },
      [SENTRY_KIND]: {
        type: 'string',
        value: 'client',
      },
      [SENTRY_ENVIRONMENT]: {
        type: 'string',
        value: 'production',
      },
      [SENTRY_OP]: {
        type: 'string',
        value: DB,
      },
      [SENTRY_ORIGIN]: {
        type: 'string',
        value: origin,
      },
      [SENTRY_RELEASE]: {
        type: 'string',
        value: '1.0',
      },
      [SENTRY_SDK_NAME]: {
        type: 'string',
        value: 'sentry.javascript.node',
      },
      [SENTRY_SDK_VERSION]: {
        type: 'string',
        value: expect.any(String),
      },
      [SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: expect.stringMatching(/^[\da-f]{16}$/),
      },
      [SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: 'Test Transaction',
      },
      [SENTRY_TRACE_LIFECYCLE]: {
        type: 'string',
        value: 'stream',
      },
    };

    const COMMON_SPAN_PROPS = {
      end_timestamp: expect.any(Number),
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    };

    const span = (queryText: string) => ({
      name: 'SELECT',
      attributes: {
        ...COMMON_ATTRIBUTES,
        [DB_QUERY_TEXT]: { type: 'string', value: queryText },
        [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT' },
      },
      ...COMMON_SPAN_PROPS,
    });

    return override?.spans ?? [span('SELECT ? + ? AS solution'), span('SELECT NOW()')];
  }

  const CHANNEL_ORIGIN = 'auto.db.mysql';

  // Channel-based (orchestrion diagnostics-channel) instrumentation is the default: `Sentry.init()`
  // injects and subscribes to the channels synchronously. We test it both with the channels installed
  // purely from `init()` and via the `node --import @sentry/node/import` preload. `flags` are extra
  // Node CLI flags; the instrument file is always loaded via `--import` by the runner.
  const CASES = [
    {
      label: 'diagnostics-channel (init)',
      env: {},
      flags: [],
      origin: CHANNEL_ORIGIN,
      failsOnEsm: false,
    },
    {
      label: 'diagnostics-channel (--import @sentry/node/import)',
      env: {},
      flags: ['--import', '@sentry/node/import'],
      origin: CHANNEL_ORIGIN,
      failsOnEsm: false,
    },
  ] as const;

  const SCENARIOS = [
    ['scenario-withConnect.mjs', 'using connection.connect()'],
    ['scenario-withoutCallback.mjs', 'using query without callback'],
    ['scenario-withoutConnect.mjs', 'without connection.connect()'],
    ['scenario-withPool.mjs', 'using createPool()'],
    [
      'scenario-streamError.mjs',
      'streamed query error',
      {
        // The segment span succeeds (status `ok`); only the failing query span is errored.
        spans: expect.arrayContaining([
          expect.objectContaining({
            name: 'SELECT does_not_exist',
            // A failing streamed query emits `error`, which marks the span as errored
            status: 'error',
            attributes: expect.objectContaining({
              [SENTRY_OP]: { type: 'string', value: DB },
              [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM does_not_exist' },
              [DB_SYSTEM_NAME]: { type: 'string', value: 'mysql' },
              [DB_USER]: { type: 'string', value: 'root' },
            }),
          }),
        ]),
      },
    ],
  ] as const;

  for (const { label, env, flags, origin, failsOnEsm } of CASES) {
    describe(label, () => {
      for (const [scenario, description, spanOverride] of SCENARIOS) {
        createEsmAndCjsTests(
          __dirname,
          scenario,
          'instrument.mjs',
          (createRunner, test) => {
            test(`should auto-instrument \`mysql\` package when ${description}`, async () => {
              await createRunner()
                .withEnv({ ...env, MYSQL_PORT: String(mysqlPort) })
                .withFlags(...flags)
                .expect({
                  span: container => {
                    expect(container.items.find(span => span.is_segment)?.name).toBe('Test Transaction');
                    const spans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === DB);
                    expect(spans).toEqual(expectedSpans(mysqlPort, origin, spanOverride));
                  },
                })
                .start()
                .completed();
            });
          },
          {
            failsOnEsm,
          },
        );
      }

      createEsmAndCjsTests(
        __dirname,
        'scenario-streamContext.mjs',
        'instrument.mjs',
        (createTestRunner, test) => {
          test('should run streamed query listeners with the parent context active', async () => {
            await createTestRunner()
              .withFlags(...flags)
              .withEnv({ ...env, MYSQL_PORT: String(mysqlPort) })
              .expect({
                span: (container): void => {
                  const transactionSpanId = container.items.find(span => span.is_segment)?.span_id;
                  const spans = container.items;
                  const mysqlSpan = spans.find(
                    span => span.attributes[DB_QUERY_TEXT]?.value === 'SELECT ? + ? AS solution',
                  );
                  const listenerSpan = spans.find(span => span.name === 'listener-child');
                  const innerSpan = spans.find(span => span.name === 'inner-span');

                  expect(transactionSpanId).toBeDefined();
                  expect(mysqlSpan).toBeDefined();
                  expect(listenerSpan).toBeDefined();
                  expect(innerSpan).toBeDefined();

                  // The span created inside the stream `end` listener is parented to the transaction
                  // (the context active when the query was issued), not to the query span.
                  expect(listenerSpan?.parent_span_id).toBe(transactionSpanId);
                  expect(listenerSpan?.parent_span_id).not.toBe(mysqlSpan?.span_id);
                  expect(innerSpan?.parent_span_id).toBe(transactionSpanId);
                },
              })
              .start()
              .completed();
          });
        },
        {
          failsOnEsm,
        },
      );
    });
  }
});
