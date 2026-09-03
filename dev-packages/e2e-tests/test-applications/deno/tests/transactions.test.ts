import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// `Deno.serve` has no route information, so with span streaming the http.server segment is
// named after the method only and the path lives in `url.path`.
function collectRequestSpans(path: string) {
  return collectStreamedSpans('deno', spans =>
    spans.some(
      span => getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === path,
    ),
  );
}

const SEGMENT_SPAN = {
  attributes: {
    ['sentry.trace_lifecycle']: {
      type: 'string',
      value: 'stream',
    },
    'app.start_time': {
      type: 'string',
      value: expect.any(String),
    },
    'client.address': {
      type: 'string',
      value: expect.any(String),
    },
    'client.port': {
      type: 'integer',
      value: expect.any(Number),
    },
    'device.archs': {
      type: 'array',
      value: expect.any(Array),
    },
    'device.processor_count': {
      type: 'integer',
      value: expect.any(Number),
    },
    'http.request.header.accept': {
      type: 'string',
      value: '*/*',
    },
    'http.request.header.accept_encoding': {
      type: 'string',
      value: 'gzip, deflate',
    },
    'http.request.header.accept_language': {
      type: 'string',
      value: '*',
    },
    'http.request.header.connection': {
      type: 'string',
      value: 'keep-alive',
    },
    'http.request.header.host': {
      type: 'string',
      value: expect.stringMatching(/^localhost:\d+$/),
    },
    'http.request.header.sec_fetch_mode': {
      type: 'string',
      value: 'cors',
    },
    'http.request.header.user_agent': {
      type: 'string',
      value: 'node',
    },
    'http.request.method': {
      type: 'string',
      value: 'GET',
    },
    'http.response.header.content_type': {
      type: 'string',
      value: 'application/json',
    },
    'http.response.status_code': {
      type: 'integer',
      value: expect.any(Number),
    },
    'network.protocol.name': {
      type: 'string',
      value: 'http',
    },
    'os.name': {
      type: 'string',
      value: expect.any(String),
    },
    'os.version': {
      type: 'string',
      value: expect.any(String),
    },
    'sentry.environment': {
      type: 'string',
      value: 'qa',
    },
    'sentry.op': {
      type: 'string',
      value: 'http.server',
    },
    'sentry.origin': {
      type: 'string',
      value: 'auto.http.deno',
    },
    'sentry.sample_rate': {
      type: 'integer',
      value: 1,
    },
    'sentry.sdk.name': {
      type: 'string',
      value: 'sentry.javascript.deno',
    },
    'sentry.sdk.version': {
      type: 'string',
      value: expect.any(String),
    },
    'sentry.sdk.integrations': {
      type: 'array',
      value: expect.arrayContaining(['SpanStreaming']),
    },
    'sentry.segment.id': {
      type: 'string',
      value: expect.stringMatching(/^[\da-f]{16}$/),
    },
    'sentry.segment.name': {
      type: 'string',
      value: 'GET',
    },
    'sentry.segment.name.source': {
      type: 'string',
      value: 'url',
    },
    'server.address': {
      type: 'string',
      value: expect.any(String),
    },
    'url.full': {
      type: 'string',
      value: expect.stringMatching(/^http:\/\/localhost:\d+\/test-sentry-span$/),
    },
    'url.path': {
      type: 'string',
      value: '/test-sentry-span',
    },
    'url.port': {
      type: 'string',
      value: expect.any(String),
    },
    'url.scheme': {
      type: 'string',
      value: 'http:',
    },
    'user_agent.original': {
      type: 'string',
      value: 'node',
    },
    'process.runtime.engine.name': {
      type: 'string',
      value: 'v8',
    },
    'process.runtime.engine.version': {
      type: 'string',
      value: expect.any(String),
    },
  },
  end_timestamp: expect.any(Number),
  is_segment: true,
  name: 'GET',
  span_id: expect.stringMatching(/^[\da-f]{16}$/),
  start_timestamp: expect.any(Number),
  status: 'ok',
  trace_id: expect.stringMatching(/^[\da-f]{32}$/),
};

const CHILD_SPAN_ATTRIBUTES = {
  ['sentry.trace_lifecycle']: {
    type: 'string',
    value: 'stream',
  },
  'sentry.environment': {
    type: 'string',
    value: 'qa',
  },
  'sentry.origin': {
    type: 'string',
    value: 'manual',
  },
  'sentry.sdk.name': {
    type: 'string',
    value: 'sentry.javascript.deno',
  },
  'sentry.sdk.version': {
    type: 'string',
    value: expect.any(String),
  },
  'sentry.segment.id': {
    type: 'string',
    value: expect.stringMatching(/^[\da-f]{16}$/),
  },
  'sentry.segment.name': {
    type: 'string',
    value: 'GET',
  },
};

test('Sends streamed spans (http.server and manual with Sentry.startSpan)', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans('/test-sentry-span');

  await fetch(`${baseURL}/test-sentry-span`);

  const spans = await spansPromise;
  expect(spans).toHaveLength(2);

  const httpServerSpan = spans.find(span => span.is_segment);
  expect(httpServerSpan).toEqual(SEGMENT_SPAN);

  const sentrySpan = spans.find(span => span.name === 'test-sentry-span');
  expect(sentrySpan).toEqual({
    attributes: CHILD_SPAN_ATTRIBUTES,
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'test-sentry-span',
    parent_span_id: httpServerSpan!.span_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: httpServerSpan!.trace_id,
  });
});

test('Sends streamed span with OTel tracer.startSpan despite pre-existing provider', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans('/test-otel-span');

  await fetch(`${baseURL}/test-otel-span`);

  const spans = await spansPromise;

  const otelSpan = spans.find(span => span.name === 'test-otel-span');
  expect(otelSpan).toEqual(
    expect.objectContaining({
      name: 'test-otel-span',
      attributes: expect.objectContaining({
        'sentry.origin': { type: 'string', value: 'manual' },
      }),
    }),
  );
  // INTERNAL (and other unmapped) kinds must not get a synthetic `otel.span` op
  expect(getSpanOp(otelSpan!)).toBeUndefined();
});

test('Sends streamed span with OTel tracer.startActiveSpan', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans('/test-otel-active-span');

  await fetch(`${baseURL}/test-otel-active-span`);

  const spans = await spansPromise;

  const otelSpan = spans.find(span => span.name === 'test-otel-active-span');
  expect(otelSpan).toEqual(
    expect.objectContaining({
      name: 'test-otel-active-span',
      attributes: expect.objectContaining({
        'sentry.origin': { type: 'string', value: 'manual' },
      }),
    }),
  );
  expect(getSpanOp(otelSpan!)).toBeUndefined();
});

test('OTel span appears as child of Sentry span (interop)', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans('/test-interop');

  await fetch(`${baseURL}/test-interop`);

  const spans = await spansPromise;

  expect(spans).toHaveLength(3);

  const httpServerSpan = spans.find(span => span.is_segment);
  expect(httpServerSpan).toEqual({
    ...SEGMENT_SPAN,
    attributes: {
      ...SEGMENT_SPAN.attributes,
      'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:\d+\/test-interop$/) },
      'url.path': { type: 'string', value: '/test-interop' },
    },
  });

  const sentrySpan = spans.find(span => span.name === 'sentry-parent');
  const otelSpan = spans.find(span => span.name === 'otel-child');

  expect(sentrySpan).toEqual({
    attributes: CHILD_SPAN_ATTRIBUTES,
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'sentry-parent',
    parent_span_id: httpServerSpan!.span_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: httpServerSpan!.trace_id,
  });

  // The OTel span is a child of the Sentry span
  expect(otelSpan).toEqual({
    attributes: {
      ...CHILD_SPAN_ATTRIBUTES,
      'sentry.deno_tracer': {
        type: 'boolean',
        value: true,
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'otel-child',
    parent_span_id: sentrySpan!.span_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: httpServerSpan!.trace_id,
  });
  expect(getSpanOp(otelSpan!)).toBeUndefined();
});
