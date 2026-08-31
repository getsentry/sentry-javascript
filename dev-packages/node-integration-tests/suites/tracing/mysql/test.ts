import type { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests, createEsmAndCjsTests } from '../../../utils/runner';
import { startMysqlTestServer } from './mysql-test-server';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';

describe('mysql auto instrumentation', () => {
  // A minimal in-process MySQL server (on a random free port) so the client's
  // connection handshake succeeds. Without it, `createPool()` queries fail at
  // connection acquisition — before `connection.query` runs — so the
  // diagnostics-channel instrumentation (which hooks `connection.query`) never
  // sees them. Queries still error (the server rejects them), so spans keep
  // `status: internal_error` as the assertions expect. The port is passed to
  // each scenario via the `MYSQL_PORT` env var.
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

  // Builds the expected transaction. When `origin` is given, the spans must also
  // carry that `sentry.origin`, which is how we assert that the
  // diagnostics-channel instrumentation (not the OTel one) produced them. A
  // scenario can pass `override` to replace the default transaction expectation
  // (e.g. the streamed-error scenario, which runs a different, failing query).
  function expectedTransaction(
    port: number,
    origin: string | undefined,
    override: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const span = (description: string): ReturnType<typeof expect.objectContaining> =>
      expect.objectContaining({
        description,
        op: 'db',
        ...(origin ? { origin } : {}),
        data: expect.objectContaining({
          ...(origin ? { 'sentry.origin': origin } : {}),
          'db.system.name': 'mysql',
          'server.address': 'localhost',
          'server.port': port,
          'db.user': 'root',
        }),
        status: 'ok',
      });

    return {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([span('SELECT 1 + 1 AS solution'), span('SELECT NOW()')]),
      ...(override ?? {}),
    };
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
        // The transaction itself succeeds (status `ok`); only the failing query's child span is errored.
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'SELECT * FROM does_not_exist',
            op: 'db',
            // A failing streamed query emits `error`, which marks the span as errored
            status: 'internal_error',
            data: expect.objectContaining({
              'db.system.name': 'mysql',
              'db.user': 'root',
            }),
          }),
        ]),
      },
    ],
  ] as const;

  for (const { label, env, flags, origin, failsOnEsm } of CASES) {
    describe(label, () => {
      for (const [scenario, description, transactionOverride] of SCENARIOS) {
        createEsmAndCjsTests(
          __dirname,
          scenario,
          'instrument.mjs',
          (createRunner, test) => {
            test(`should auto-instrument \`mysql\` package when ${description}`, async () => {
              await createRunner()
                .withEnv({ ...env, MYSQL_PORT: String(mysqlPort) })
                .withFlags(...flags)
                .expect({ transaction: expectedTransaction(mysqlPort, origin, transactionOverride) })
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
                transaction: (transaction): void => {
                  const transactionSpanId = transaction.contexts?.trace?.span_id;
                  const spans = transaction.spans ?? [];
                  const mysqlSpan = spans.find(span => span.description === 'SELECT 1 + 1 AS solution');
                  const listenerSpan = spans.find(span => span.description === 'listener-child');
                  const innerSpan = spans.find(span => span.description === 'inner-span');

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

  describe('streamed', () => {
    const assertMysqlSpans = (container: SerializedStreamedSpanContainer): void => {
      const segmentSpan = container.items.find(item => item.is_segment);
      expect(segmentSpan?.name).toBe('Test Transaction');

      const dbSpans = container.items.filter(
        spanItem => spanItem.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'db',
      );

      expect(dbSpans.length).toBe(2);

      const COMMON_ATTRIBUTES = {
        'db.connection_string': {
          type: 'string',
          value: expect.stringMatching(/^jdbc:mysql:\/\/localhost:.*/),
        },
        'db.system.name': {
          type: 'string',
          value: 'mysql',
        },
        'db.user': {
          type: 'string',
          value: 'root',
        },
        'server.address': {
          type: 'string',
          value: 'localhost',
        },
        'server.port': {
          type: 'integer',
          value: expect.any(Number),
        },
        'sentry.kind': {
          type: 'string',
          value: 'client',
        },
        'sentry.environment': {
          type: 'string',
          value: 'production',
        },
        'sentry.op': {
          type: 'string',
          value: 'db',
        },
        'sentry.origin': {
          type: 'string',
          value: 'auto.db.mysql',
        },
        'sentry.release': {
          type: 'string',
          value: '1.0',
        },
        'sentry.sdk.name': {
          type: 'string',
          value: 'sentry.javascript.node',
        },
        'sentry.sdk.version': {
          type: 'string',
          value: expect.any(String),
        },
        'sentry.segment.id': {
          type: 'string',
          value: expect.stringMatching(/^[\da-f]{16}$/),
        },
        'sentry.segment.name': {
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

      expect(dbSpans).toEqual([
        {
          attributes: {
            ...COMMON_ATTRIBUTES,
            'db.query.text': {
              type: 'string',
              value: 'SELECT 1 + 1 AS solution',
            },
            'db.query.summary': {
              type: 'string',
              value: 'SELECT',
            },
          },
          name: 'SELECT',
          ...COMMON_SPAN_PROPS,
        },
        {
          attributes: {
            ...COMMON_ATTRIBUTES,
            'db.query.text': {
              type: 'string',
              value: 'SELECT NOW()',
            },
            'db.query.summary': {
              type: 'string',
              value: 'SELECT',
            },
          },
          name: 'SELECT',
          ...COMMON_SPAN_PROPS,
        },
      ]);
    };

    describe('with connection.connect()', () => {
      createCjsTests(__dirname, 'scenario-withConnect.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test('should auto-instrument `mysql` package when using connection.connect()', async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true', MYSQL_PORT: String(mysqlPort) })
            .expect({
              span: assertMysqlSpans,
            })
            .start()
            .completed();
        });
      });
    });

    describe('query without callback', () => {
      createCjsTests(__dirname, 'scenario-withoutCallback.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test('should auto-instrument `mysql` package when using query without callback', async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true', MYSQL_PORT: String(mysqlPort) })
            .expect({ span: assertMysqlSpans })
            .start()
            .completed();
        });
      });
    });

    describe('without connection.connect()', () => {
      createCjsTests(__dirname, 'scenario-withoutConnect.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test('should auto-instrument `mysql` package without connection.connect()', async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true', MYSQL_PORT: String(mysqlPort) })
            .expect({
              span: assertMysqlSpans,
            })
            .start()
            .completed();
        });
      });
    });
  });
});
