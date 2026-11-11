import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForEnvelopeItem,
  waitForError,
} from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:http';

const APP_NAME = 'nestjs-12';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PARENT_SPAN_ID = 'bbbbbbbbbbbbbbbb';

test('Names the request span after the parameterized route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-param/:param');

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(await response.json()).toEqual({ param: '123' });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'http.route': { type: 'string', value: '/test-param/:param' },
    'url.path': { type: 'string', value: '/test-param/123' },
  });
});

test('Keeps the scope data of concurrent requests apart', async ({ baseURL }) => {
  const ids = ['1', '2', '3'];
  const errorPromises = ids.map(id =>
    waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === `Isolated error ${id}`),
  );

  await Promise.all(ids.map(id => fetch(`${baseURL}/test-isolation/${id}`)));

  const errors = await Promise.all(errorPromises);
  errors.forEach((error, index) => {
    expect(error.tags?.['isolation-id']).toBe(ids[index]);
    expect(error.transaction).toBe('GET /test-isolation/:id');
  });

  const traceIds = errors.map(error => error.contexts?.trace?.trace_id);
  expect(new Set(traceIds).size).toBe(ids.length);
});

test('Continues the trace of an incoming request', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span => span.name === 'GET /test-param/:param' && span.trace_id === TRACE_ID,
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
    const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-outgoing-fetch');

    const response = await fetch(`${baseURL}/test-outgoing-fetch`);
    expect(await response.json()).toEqual({ status: 200 });

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.is_segment)!;
    const fetchSpan = spans.find(span => getSpanOp(span) === 'http.client');

    expect(fetchSpan).toBeDefined();
    expect(fetchSpan!.trace_id).toBe(segmentSpan.trace_id);
    expect(fetchSpan!.attributes['http.request.method']).toEqual({ type: 'string', value: 'GET' });

    expect(receivedHeaders?.['sentry-trace']).toBe(`${segmentSpan.trace_id}-${fetchSpan!.span_id}-1`);
    expect(receivedHeaders?.baggage).toContain(`sentry-trace_id=${segmentSpan.trace_id}`);
    expect(receivedHeaders?.baggage).toContain('sentry-environment=qa');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Sends logs', async ({ baseURL }) => {
  const logPromise = waitForEnvelopeItem(
    APP_NAME,
    item => item[0].type === 'log' && (item[1] as SerializedLogContainer).items.some(log => log.body === 'test-log'),
  );

  await fetch(`${baseURL}/test-log`);

  const log = ((await logPromise)[1] as SerializedLogContainer).items.find(log => log.body === 'test-log')!;
  expect(log.level).toBe('info');
  expect(log.trace_id).toMatch(/^[a-f0-9]{32}$/);
  expect(log.attributes?.route).toEqual({ type: 'string', value: 'test-log' });
});
