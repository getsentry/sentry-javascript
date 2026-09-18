import { expect, test } from '@playwright/test';
import {
  waitForError,
  waitForStreamedSpan,
  getSpanOp,
  collectStreamedSpansUntilSegment,
} from '@sentry-internal/test-utils';

test('Should record exceptions captured inside handlers', async ({ request }) => {
  const errorEventPromise = waitForError('node-express-esm-loader', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('This is an error');
  });

  await request.get('/test-error');

  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Should record a span for a parameterless route', async ({ request }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'node-express-esm-loader',
    segment => segment.is_segment && segment.name === 'GET /test-success',
  );

  await request.get('/test-success');

  await expect(segmentEventPromise).resolves.toBeDefined();
});

test('Should record a span for route with parameters', async ({ request }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'node-express-esm-loader',
    segment => segment.attributes?.['url.path']?.value === '/test-transaction/1',
  );

  await request.get('/test-transaction/1');

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && segment.attributes?.['url.path']?.value === '/test-transaction/1',
  )!;

  expect(segmentEvent).toBeDefined();
  expect(segmentEvent.name).toEqual('GET /test-transaction/:param');
  expect(segmentEvent.attributes).toEqual(
    expect.objectContaining({
      'http.request.method': { value: 'GET', type: 'string' },
      'http.response.status_code': { value: 200, type: 'integer' },
      'http.route': { value: '/test-transaction/:param', type: 'string' },
      'url.scheme': { value: 'http', type: 'string' },
      'http.response.status_text': { value: 'OK', type: 'string' },
      'url.full': { value: 'http://localhost:3030/test-transaction/1', type: 'string' },
      'user_agent.original': { value: expect.any(String), type: 'string' },
      'network.local.address': { value: expect.any(String), type: 'string' },
      'server.address': { value: 'localhost', type: 'string' },
      'network.local.port': { value: 3030, type: 'integer' },
      'network.peer.address': { value: expect.any(String), type: 'string' },
      'network.peer.port': { value: expect.any(Number), type: 'integer' },
      'network.transport': { value: 'tcp', type: 'string' },
      'sentry.kind': { value: 'server', type: 'string' },
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
      'sentry.sample_rate': { value: 1, type: 'integer' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    }),
  );

  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );
  expect(spans.filter(span => span.name === 'query')).toEqual([
    expect.objectContaining({
      name: 'query',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'express.name': { value: 'query', type: 'string' },
        'express.type': { value: 'middleware', type: 'string' },
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
      }),
    }),
  ]);

  expect(spans.filter(span => span.name === 'expressInit')).toEqual([
    expect.objectContaining({
      name: 'expressInit',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'express.name': { value: 'expressInit', type: 'string' },
        'express.type': { value: 'middleware', type: 'string' },
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
      }),
    }),
  ]);

  expect(spans.filter(span => span.name === '/test-transaction/:param')).toEqual([
    expect.objectContaining({
      name: '/test-transaction/:param',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'express.name': { value: '/test-transaction/:param', type: 'string' },
        'express.type': { value: 'request_handler', type: 'string' },
        'http.route': { value: '/test-transaction/:param', type: 'string' },
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'handler', type: 'string' },
      }),
    }),
  ]);
});

test('Instruments MySQL via Orchestrion', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'node-express-esm-loader',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-mysql',
  );

  await fetch(`${baseURL}/test-mysql`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-mysql',
  )!;

  expect(getSpanOp(segmentEvent)).toEqual('http.server');
  expect(segmentEvent.name).toEqual('GET /test-mysql');
  expect(segmentEvent?.status).toEqual('ok');
  expect(segmentEvent.attributes?.['http.response.status_code']?.value).toEqual(200);

  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');
  expect(dbSpans).toHaveLength(2);
  expect(dbSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'SELECT',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'db', type: 'string' },
          'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
          'db.query.text': { value: 'SELECT ? + ? AS solution', type: 'string' },
        }),
      }),
      expect.objectContaining({
        name: 'SELECT',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'db', type: 'string' },
          'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
          'db.query.text': { value: 'SELECT NOW()', type: 'string' },
        }),
      }),
    ]),
  );
});
