import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('mysql auto instrumentation (streamed)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const assertMysqlSpans = (container: SerializedStreamedSpanContainer): void => {
    const segmentSpan = container.items.find(item => item.is_segment);
    expect(segmentSpan?.name).toBe('Test Transaction');

    const dbSpans = container.items.filter(
      spanItem => spanItem.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'db',
    );

    expect(dbSpans.length).toBe(2);

    expect(dbSpans).toEqual([
      {
        attributes: {
          'db.connection_string': {
            type: 'string',
            value: expect.stringMatching(/^jdbc:mysql:\/\/localhost:.*/),
          },
          'db.statement': {
            type: 'string',
            value: 'SELECT 1 + 1 AS solution',
          },
          'db.system': {
            type: 'string',
            value: 'mysql',
          },
          'db.user': {
            type: 'string',
            value: 'root',
          },
          'net.peer.name': {
            type: 'string',
            value: 'localhost',
          },
          'net.peer.port': {
            type: 'integer',
            value: expect.any(Number),
          },
          'otel.kind': {
            type: 'string',
            value: 'CLIENT',
          },
          'sentry.environment': {
            type: 'string',
            value: 'production',
          },
          'sentry.op': {
            type: 'string',
            value: 'db',
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
          'sentry.source': {
            type: 'string',
            value: 'task',
          },
          'sentry.span.source': {
            type: 'string',
            value: 'task',
          },
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        name: 'SELECT 1 + 1 AS solution',
        parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status: 'error',
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      },
      {
        attributes: {
          'db.connection_string': {
            type: 'string',
            value: expect.stringMatching(/^jdbc:mysql:\/\/localhost:.*/),
          },
          'db.statement': {
            type: 'string',
            value: 'SELECT NOW()',
          },
          'db.system': {
            type: 'string',
            value: 'mysql',
          },
          'db.user': {
            type: 'string',
            value: 'root',
          },
          'net.peer.name': {
            type: 'string',
            value: 'localhost',
          },
          'net.peer.port': {
            type: 'integer',
            value: expect.any(Number),
          },
          'otel.kind': {
            type: 'string',
            value: 'CLIENT',
          },
          'sentry.environment': {
            type: 'string',
            value: 'production',
          },
          'sentry.op': {
            type: 'string',
            value: 'db',
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
          'sentry.source': {
            type: 'string',
            value: 'task',
          },
          'sentry.span.source': {
            type: 'string',
            value: 'task',
          },
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        name: 'SELECT NOW()',
        parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status: 'error',
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      },
    ]);
  };

  describe('with connection.connect()', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withConnect.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `mysql` package when using connection.connect()', async () => {
          await createTestRunner().expect({ span: assertMysqlSpans }).start().completed();
        });
      },
      { failsOnEsm: true },
    );
  });

  describe('query without callback', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutCallback.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `mysql` package when using query without callback', async () => {
          await createTestRunner().expect({ span: assertMysqlSpans }).start().completed();
        });
      },
      { failsOnEsm: true },
    );
  });

  describe('without connection.connect()', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutConnect.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `mysql` package without connection.connect()', async () => {
          await createTestRunner().expect({ span: assertMysqlSpans }).start().completed();
        });
      },
      { failsOnEsm: true },
    );
  });
});
