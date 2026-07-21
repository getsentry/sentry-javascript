import type { TransactionEvent } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('bindScopeToEmitter preserves the active span for listeners firing in a different async context', async () => {
  // Collect both transactions regardless of the order they are flushed in.
  const transactions: Record<string, TransactionEvent> = {};
  const collect = (event: TransactionEvent): void => {
    transactions[event.transaction as string] = event;
  };

  await createRunner(__dirname, 'scenario.ts')
    .expect({ transaction: collect })
    .expect({ transaction: collect })
    .start()
    .completed();

  const parent = transactions['parent'];
  const childUnbound = transactions['child-unbound'];

  expect(parent).toBeDefined();
  expect(childUnbound).toBeDefined();

  const parentTraceId = parent?.contexts?.trace?.trace_id;
  const parentSpanId = parent?.contexts?.trace?.span_id;

  // The bound emitter's listener ran inside the parent span context -> nested child span.
  const childBound = parent?.spans?.find(span => span.description === 'child-bound');
  expect(childBound).toBeDefined();
  expect(childBound?.parent_span_id).toBe(parentSpanId);
  expect(childBound?.trace_id).toBe(parentTraceId);

  // The unbound emitter's listener ran without the parent active -> its own, separate trace.
  expect(childUnbound?.spans).toEqual([]);
  expect(childUnbound?.contexts?.trace?.trace_id).not.toBe(parentTraceId);
});
