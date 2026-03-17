import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('errors from in different requests each get a unique traceId when tracing is enabled', async () => {
  const eventTraceIds: string[] = [];

  const runner = createRunner(__dirname, 'server.js')
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
        // console.log('xx event 3');
        eventTraceIds.push(event.contexts?.trace?.trace_id || '');
      },
    })
    .start();

  await runner.makeRequest('get', '/test');
  await runner.makeRequest('get', '/test');
  await runner.makeRequest('get', '/test');

  await runner.completed();

  expect(new Set(eventTraceIds).size).toBe(3);
  for (const traceId of eventTraceIds) {
    expect(traceId).toMatch(/^[a-f\d]{32}$/);
  }
});
