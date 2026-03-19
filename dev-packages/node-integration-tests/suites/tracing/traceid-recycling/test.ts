import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('each request gets a unique traceId when tracing is disabled', async () => {
  const eventTraceIds: string[] = [];

  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      event: event => {
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .expect({
      event: event => {
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .expect({
      event: event => {
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .start();

  const propagationContextTraceIds = [
    ((await runner.makeRequest('get', '/test')) as { traceId: string }).traceId,
    ((await runner.makeRequest('get', '/test')) as { traceId: string }).traceId,
    ((await runner.makeRequest('get', '/test')) as { traceId: string }).traceId,
  ];

  await runner.completed();

  expect(new Set(propagationContextTraceIds).size).toBe(3);
  for (const traceId of propagationContextTraceIds) {
    expect(traceId).toMatch(/^[a-f\d]{32}$/);
  }

  expect(eventTraceIds).toEqual(propagationContextTraceIds);
});
