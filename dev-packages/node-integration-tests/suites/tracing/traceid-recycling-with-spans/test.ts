import { join } from 'path';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('errors and spans get a unique traceId per request, when tracing is enabled', async () => {
  const eventTraceIds: string[] = [];

  const runner = createRunner(__dirname, 'server.js')
    .withFlags('--import', join(__dirname, 'instrument.cjs'))
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
    });

  const seenSegmentIds = new Set<string>();
  const spansPromises = Array.from({ length: 3 }, () =>
    runner.collectStreamedSpansUntilSegment(segment => {
      if (seenSegmentIds.has(segment.span_id)) return false;
      seenSegmentIds.add(segment.span_id);
      return true;
    }),
  );

  const started = runner.start();

  await started.makeRequest('get', '/test');
  await started.makeRequest('get', '/test');
  await started.makeRequest('get', '/test');

  await started.completed();

  const spanTraceIds = (await Promise.all(spansPromises)).map(
    spans => spans.find(span => !span.is_segment)?.trace_id || '',
  );

  expect(new Set(spanTraceIds).size).toBe(3);
  for (const traceId of spanTraceIds) {
    expect(traceId).toMatch(/^[a-f\d]{32}$/);
  }

  expect(eventTraceIds.sort()).toEqual(spanTraceIds.sort());
});
