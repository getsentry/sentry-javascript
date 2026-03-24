import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('errors and transactions get a unique traceId per request, when tracing is enabled', async () => {
  const eventTraceIds: string[] = [];
  const transactionTraceIds: string[] = [];

  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      event: event => {
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .expect({
      transaction: transaction => {
        transactionTraceIds.push(transaction.spans?.[0]?.trace_id || '');
      },
    })
    .expect({
      event: event => {
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .expect({
      transaction: transaction => {
        transactionTraceIds.push(transaction.spans?.[0]?.trace_id || '');
      },
    })
    .expect({
      event: event => {
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .expect({
      transaction: transaction => {
        transactionTraceIds.push(transaction.spans?.[0]?.trace_id || '');
      },
    })
    .start();

  await runner.makeRequest('get', '/test');
  await runner.makeRequest('get', '/test');
  await runner.makeRequest('get', '/test');

  await runner.completed();

  expect(new Set(transactionTraceIds).size).toBe(3);
  for (const traceId of transactionTraceIds) {
    expect(traceId).toMatch(/^[a-f\d]{32}$/);
  }

  expect(eventTraceIds).toEqual(transactionTraceIds);
});
