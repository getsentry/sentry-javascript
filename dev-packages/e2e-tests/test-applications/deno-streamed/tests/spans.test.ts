import { expect, test } from '@playwright/test';
import { waitForStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const SEGMENT_SPAN = {
  attributes: {
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
    // TODO: 'device.archs' is set but arrays are not yet serialized in span attributes
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
    'sentry.segment.id': {
      type: 'string',
      value: expect.stringMatching(/^[\da-f]{16}$/),
    },
    'sentry.segment.name': {
      type: 'string',
      value: 'GET /test-sentry-span',
    },
    'sentry.source': {
      type: 'string',
      value: 'url',
    },
    'sentry.span.source': {
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
  name: 'GET /test-sentry-span',
  span_id: expect.stringMatching(/^[\da-f]{16}$/),
  start_timestamp: expect.any(Number),
  status: 'ok',
  trace_id: expect.stringMatching(/^[\da-f]{32}$/),
};

test('Sends streamed spans (http.server and manual with Sentry.startSpan)', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('deno-streamed', spans => {
    return spans.some(span => span.name === 'test-sentry-span');
  });

  await fetch(`${baseURL}/test-sentry-span`);

  const spans = await spansPromise;
  expect(spans).toHaveLength(2);

  expect(spans).toEqual([
    {
      attributes: {
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
          value: 'GET /test-sentry-span',
        },
      },
      end_timestamp: expect.any(Number),
      is_segment: false,
      name: 'test-sentry-span',
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    },
    SEGMENT_SPAN,
  ]);
});

test('OTel span appears as child of Sentry span (interop)', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('deno-streamed', spans => {
    return spans.some(span => span.name === 'sentry-parent');
  });

  await fetch(`${baseURL}/test-interop`);

  const spans = await spansPromise;

  expect(spans).toHaveLength(3);

  const httpServerSpan = spans.find(span => getSpanOp(span) === 'http.server');
  expect(httpServerSpan).toEqual({
    ...SEGMENT_SPAN,
    name: 'GET /test-interop',
    attributes: {
      ...SEGMENT_SPAN.attributes,
      'sentry.segment.name': { type: 'string', value: 'GET /test-interop' },
      'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:\d+\/test-interop$/) },
      'url.path': { type: 'string', value: '/test-interop' },
    },
  });
  // Verify the OTel span is a child of the Sentry span
  const sentrySpan = spans.find(span => span.name === 'sentry-parent');
  const otelSpan = spans.find(span => span.name === 'otel-child');

  expect(otelSpan!.parent_span_id).toBe(sentrySpan!.span_id);

  expect(sentrySpan).toEqual({
    attributes: {
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
        value: 'GET /test-interop',
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'sentry-parent',
    parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: httpServerSpan!.trace_id,
  });

  expect(otelSpan).toEqual({
    attributes: {
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
        value: 'GET /test-interop',
      },
      'sentry.deno_tracer': {
        type: 'boolean',
        value: true,
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'otel-child',
    parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: httpServerSpan!.trace_id,
  });
});
