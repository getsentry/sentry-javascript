import type { SpanJSON } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { assertSentryTransaction } from '../../../../utils/assertions';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should report finished spans as children of the root transaction.', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: transaction => {
        const rootSpanId = transaction.contexts?.trace?.span_id;
        const span3Id = transaction.spans?.[1]?.span_id;

        expect(rootSpanId).toEqual(expect.any(String));
        expect(span3Id).toEqual(expect.any(String));

        assertSentryTransaction(transaction, {
          transaction: 'root_span',
          spans: [
            {
              description: 'span_1',
              data: {
                foo: 'bar',
                baz: [1, 2, 3],
              },
              parent_span_id: rootSpanId,
            },
            {
              description: 'span_3',
              parent_span_id: rootSpanId,
              data: {},
            },
            {
              description: 'span_5',
              parent_span_id: span3Id,
              data: {},
            },
          ] as SpanJSON[],
        });
      },
    })
    .start()
    .completed();
});
