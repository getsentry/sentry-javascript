import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-basic';

const SPAN_ID = /^[a-f0-9]{16}$/;

/** The full shape of a `@SentryTraced` span, so `toEqual` catches anything unexpected. */
function tracedSpan(segmentSpan: SerializedStreamedSpan, name: string, op: string): Record<string, unknown> {
  return {
    name,
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: expect.stringMatching(SPAN_ID),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'ok',
    attributes: {
      'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
      'sentry.segment.name': { type: 'string', value: segmentSpan.name },
      'sentry.segment.id': { type: 'string', value: segmentSpan.span_id },
      'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.nestjs' },
      'sentry.sdk.version': { type: 'string', value: expect.any(String) },
      'sentry.environment': { type: 'string', value: 'qa' },
      // CI builds the apps with a release, local runs have none. It comes from the client
      // options, so whatever the segment span got, every other span of the trace got too.
      ...(segmentSpan.attributes['sentry.release']
        ? { 'sentry.release': { type: 'string', value: expect.any(String) } }
        : {}),
      'sentry.origin': { type: 'string', value: 'auto.function.nestjs.sentry_traced' },
      'sentry.op': { type: 'string', value: op },
    },
  };
}

test('Trace includes span and correct value for decorated async function', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-span-decorator-async');

  const response = await fetch(`${baseURL}/test-span-decorator-async`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const spans = await spansPromise;

  const segmentSpan = spans.find(span => span.is_segment)!;
  expect(spans.find(span => span.name === 'wait')).toEqual(tracedSpan(segmentSpan, 'wait', 'wait and return a string'));
});

test('Trace includes span and correct value for decorated sync function', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-span-decorator-sync');

  const response = await fetch(`${baseURL}/test-span-decorator-sync`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const spans = await spansPromise;

  const segmentSpan = spans.find(span => span.is_segment)!;
  expect(spans.find(span => span.name === 'getString')).toEqual(
    tracedSpan(segmentSpan, 'getString', 'return a string'),
  );
});

test('preserves original function name on decorated functions', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-function-name`);
  const body = await response.json();

  expect(body.result).toEqual('getFunctionName');
});
