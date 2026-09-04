import crypto from 'crypto';
import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-distributed-tracing';

function isSegmentOf(span: SerializedStreamedSpan, urlPath: string): boolean {
  return span.is_segment && span.attributes['url.path']?.value === urlPath;
}

/**
 * Both apps stream into the same trace when propagation works, so the whole request is only in hand
 * once every segment span it produced has arrived.
 */
function collectTrace(...urlPaths: string[]): Promise<SerializedStreamedSpan[]> {
  return collectStreamedSpans(APP_NAME, spansOfTrace =>
    urlPaths.every(urlPath => spansOfTrace.some(span => isSegmentOf(span, urlPath))),
  );
}

function expectBaggage(rawBaggage: string | undefined, traceId: string): void {
  expect(rawBaggage).toBeDefined();
  expect((rawBaggage ?? '').split(',')).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );
}

test('Propagates trace for outgoing http requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const spansPromise = collectTrace(`/test-outgoing-http/${id}`, `/test-inbound-headers/${id}`);

  const response = await fetch(`${baseURL}/test-outgoing-http/${id}`);
  const data = await response.json();

  const spans = await spansPromise;

  const outboundSegmentSpan = spans.find(span => isSegmentOf(span, `/test-outgoing-http/${id}`))!;
  const inboundSegmentSpan = spans.find(span => isSegmentOf(span, `/test-inbound-headers/${id}`))!;
  const traceId = outboundSegmentSpan.trace_id;

  const outgoingHttpSpan = spans.find(span => getSpanOp(span) === 'http.client');
  expect(outgoingHttpSpan).toBeDefined();

  // The outgoing span keeps only the domain in its name, so the request it stands for is spelled
  // out in `url.full`.
  expect(outgoingHttpSpan!.name).toBe('GET localhost');
  expect(outgoingHttpSpan!.attributes['url.full']?.value).toBe(`http://localhost:3030/test-inbound-headers/${id}`);

  // Outgoing span (`http.client`) does not include headers as attributes
  expect(Object.keys(outgoingHttpSpan!.attributes).some(key => key.startsWith('http.request.header.'))).toBe(false);

  // data is passed through from the inbound request, to verify we have the correct headers set
  expect(data.headers?.['sentry-trace']).toEqual(`${traceId}-${outgoingHttpSpan!.span_id}-1`);
  expectBaggage(data.headers?.['baggage'], traceId);

  expect(outboundSegmentSpan).toMatchObject({
    name: 'GET /test-outgoing-http/:id',
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
      'sentry.op': { type: 'string', value: 'http.server' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.sample_rate': { type: 'integer', value: 1 },
      'sentry.kind': { type: 'string', value: 'server' },
      'http.request.method': { type: 'string', value: 'GET' },
      'http.route': { type: 'string', value: '/test-outgoing-http/:id' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'url.full': { type: 'string', value: `http://localhost:3030/test-outgoing-http/${id}` },
      'server.address': { type: 'string', value: 'localhost' },
      'server.port': { type: 'integer', value: 3030 },
    }),
  });
  expect(outboundSegmentSpan.parent_span_id).toBeUndefined();

  // The inbound request continues the trace, hanging off the outgoing client span
  expect(inboundSegmentSpan).toMatchObject({
    name: 'GET /test-inbound-headers/:id',
    status: 'ok',
    parent_span_id: outgoingHttpSpan!.span_id,
    attributes: expect.objectContaining({
      'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
      'sentry.op': { type: 'string', value: 'http.server' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'http.route': { type: 'string', value: '/test-inbound-headers/:id' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'url.full': { type: 'string', value: `http://localhost:3030/test-inbound-headers/${id}` },
      'http.request.header.sentry_trace': {
        type: 'string',
        value: expect.stringMatching(/[a-f0-9]{32}-[a-f0-9]{16}-1/),
      },
      'http.request.header.baggage': { type: 'string', value: expect.any(String) },
    }),
  });
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const spansPromise = collectTrace(`/test-outgoing-fetch/${id}`, `/test-inbound-headers/${id}`);

  const response = await fetch(`${baseURL}/test-outgoing-fetch/${id}`);
  const data = await response.json();

  const spans = await spansPromise;

  const outboundSegmentSpan = spans.find(span => isSegmentOf(span, `/test-outgoing-fetch/${id}`))!;
  const inboundSegmentSpan = spans.find(span => isSegmentOf(span, `/test-inbound-headers/${id}`))!;
  const traceId = outboundSegmentSpan.trace_id;

  const outgoingFetchSpan = spans.find(span => getSpanOp(span) === 'http.client');
  expect(outgoingFetchSpan).toBeDefined();

  expect(outgoingFetchSpan!.name).toBe('GET localhost');
  expect(outgoingFetchSpan!.attributes['url.full']?.value).toBe(`http://localhost:3030/test-inbound-headers/${id}`);

  // Outgoing span (`http.client`) does not include headers as attributes
  expect(Object.keys(outgoingFetchSpan!.attributes).some(key => key.startsWith('http.request.header.'))).toBe(false);

  expect(data.headers?.['sentry-trace']).toEqual(`${traceId}-${outgoingFetchSpan!.span_id}-1`);
  expectBaggage(data.headers?.['baggage'], traceId);

  expect(outboundSegmentSpan).toMatchObject({
    name: 'GET /test-outgoing-fetch/:id',
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
      'sentry.op': { type: 'string', value: 'http.server' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'http.route': { type: 'string', value: '/test-outgoing-fetch/:id' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'url.full': { type: 'string', value: `http://localhost:3030/test-outgoing-fetch/${id}` },
    }),
  });

  expect(inboundSegmentSpan).toMatchObject({
    name: 'GET /test-inbound-headers/:id',
    status: 'ok',
    parent_span_id: outgoingFetchSpan!.span_id,
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'http.server' },
      'http.route': { type: 'string', value: '/test-inbound-headers/:id' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'url.full': { type: 'string', value: `http://localhost:3030/test-inbound-headers/${id}` },
    }),
  });
});

test('Propagates trace for outgoing external http requests', async ({ baseURL }) => {
  const spansPromise = collectTrace('/test-outgoing-http-external-allowed', '/external-allowed');

  const response = await fetch(`${baseURL}/test-outgoing-http-external-allowed`);
  const data = await response.json();

  const spans = await spansPromise;
  const outgoingHttpSpan = spans.find(span => getSpanOp(span) === 'http.client')!;
  const traceId = outgoingHttpSpan.trace_id;

  expect(data).toEqual({
    headers: expect.objectContaining({
      'sentry-trace': `${traceId}-${outgoingHttpSpan.span_id}-1`,
      baggage: expect.any(String),
    }),
    route: 'external-allowed',
  });

  expectBaggage(data.headers.baggage, traceId);
});

test('Does not propagate outgoing http requests not covered by tracePropagationTargets', async ({ baseURL }) => {
  // Without propagation the receiving app opens a trace of its own, so this one ends at the segment
  // span of the request under test.
  const spansPromise = collectTrace('/test-outgoing-http-external-disallowed');

  const response = await fetch(`${baseURL}/test-outgoing-http-external-disallowed`);
  const data = await response.json();

  const spans = await spansPromise;
  expect(spans.find(span => getSpanOp(span) === 'http.client')).toBeDefined();

  expect(data.route).toBe('external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});

test('Propagates trace for outgoing external fetch requests', async ({ baseURL }) => {
  const spansPromise = collectTrace('/test-outgoing-fetch-external-allowed', '/external-allowed');

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-allowed`);
  const data = await response.json();

  const spans = await spansPromise;
  const outgoingFetchSpan = spans.find(span => getSpanOp(span) === 'http.client')!;
  const traceId = outgoingFetchSpan.trace_id;

  expect(data).toEqual({
    headers: expect.objectContaining({
      'sentry-trace': `${traceId}-${outgoingFetchSpan.span_id}-1`,
      baggage: expect.any(String),
    }),
    route: 'external-allowed',
  });

  expectBaggage(data.headers.baggage, traceId);
});

test('Does not propagate outgoing fetch requests not covered by tracePropagationTargets', async ({ baseURL }) => {
  const spansPromise = collectTrace('/test-outgoing-fetch-external-disallowed');

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-disallowed`);
  const data = await response.json();

  const spans = await spansPromise;
  expect(spans.find(span => getSpanOp(span) === 'http.client')).toBeDefined();

  expect(data.route).toBe('external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});
