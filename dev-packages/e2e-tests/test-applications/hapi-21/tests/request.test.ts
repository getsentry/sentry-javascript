import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:http';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PARENT_SPAN_ID = 'bbbbbbbbbbbbbbbb';

test('Names the request span after the parameterized route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment('hapi-21', 'GET /test-param/{param}');

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(await response.json()).toEqual({ paramWas: '123' });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'http.route': { type: 'string', value: '/test-param/{param}' },
    'url.path': { type: 'string', value: '/test-param/123' },
  });
});

test('Keeps the scope data of concurrent requests apart', async ({ baseURL }) => {
  const ids = ['1', '2', '3'];
  const errorPromises = ids.map(id =>
    waitForError('hapi-21', event => event.exception?.values?.[0]?.value === `Isolated error ${id}`),
  );

  const segmentSpansPromises = ids.map(id =>
    collectStreamedSpansUntilSegment(
      'hapi-21',
      span =>
        span.name === 'GET /test-isolation/{id}' && span.attributes['url.path']?.value === `/test-isolation/${id}`,
    ),
  );

  await Promise.all(ids.map(id => fetch(`${baseURL}/test-isolation/${id}`)));

  const errors = await Promise.all(errorPromises);
  const segmentSpans = (await Promise.all(segmentSpansPromises)).map(spans => spans.find(span => span.is_segment));
  errors.forEach((error, index) => {
    expect(error.tags?.['isolation-id']).toBe(ids[index]);
    expect(error.contexts?.trace?.trace_id).toBe(segmentSpans[index]?.trace_id);
  });

  const traceIds = errors.map(error => error.contexts?.trace?.trace_id);
  expect(new Set(traceIds).size).toBe(ids.length);
});

test('Continues the trace of an incoming request', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'hapi-21',
    span => span.name === 'GET /test-param/{param}' && span.trace_id === TRACE_ID,
  );

  await fetch(`${baseURL}/test-param/continued`, {
    headers: {
      'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      baggage: `sentry-trace_id=${TRACE_ID},sentry-environment=qa,sentry-public_key=public,sentry-sampled=true`,
    },
  });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.trace_id).toBe(TRACE_ID);
  expect(segmentSpan.parent_span_id).toBe(PARENT_SPAN_ID);
});

test('Propagates the trace to an outgoing fetch request', async ({ baseURL }) => {
  let receivedHeaders: IncomingHttpHeaders | undefined;
  const server = createServer((req, res) => {
    receivedHeaders = req.headers;
    res.end('ok');
  });
  await new Promise<void>(resolve => server.listen(3040, resolve));

  try {
    const spansPromise = collectStreamedSpansUntilSegment('hapi-21', 'GET /test-outgoing-fetch');

    const response = await fetch(`${baseURL}/test-outgoing-fetch`);
    expect(await response.json()).toEqual({ status: 200 });

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.is_segment)!;
    const fetchSpans = spans.filter(span => getSpanOp(span) === 'http.client');

    expect(fetchSpans).toHaveLength(1);
    const fetchSpan = fetchSpans[0]!;
    expect(fetchSpan.trace_id).toBe(segmentSpan.trace_id);
    expect(fetchSpan.attributes['http.request.method']).toEqual({ type: 'string', value: 'GET' });

    expect(receivedHeaders?.['sentry-trace']).toBe(`${segmentSpan.trace_id}-${fetchSpan.span_id}-1`);
    expect(receivedHeaders?.baggage).toContain(`sentry-trace_id=${segmentSpan.trace_id}`);
    expect(receivedHeaders?.baggage).toContain('sentry-environment=qa');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
