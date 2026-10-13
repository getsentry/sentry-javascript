import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';

// The agent request segment is the Durable Object's `http.server` span. It has a parent because
// the worker propagates its trace over the RPC binding; the worker's own segment for the same URL
// does not. With span streaming the name is the method only, so the segment is picked by `url.path`.

test('@callable() methods work correctly with Sentry instrumentAgentWithSentry', async ({ page, baseURL }) => {
  const requestSpanPromise = waitForStreamedSpan(
    'cloudflare-agent',
    span =>
      getSpanOp(span) === 'http.server' &&
      span.is_segment &&
      span.attributes['url.path']?.value === '/agents/my-agent/user-123' &&
      span.parent_span_id !== undefined,
  );

  // The greet() call goes over the websocket, so its storage spans are children of the `greet` rpc
  // span inside a webSocketMessage segment. Control messages produce their own webSocketMessage
  // segments without storage spans. Streamed children arrive before their segment, so collect until
  // the segment that closes the trace of a `greet` call has arrived.
  const storageSpansPromise = collectStreamedSpans(
    'cloudflare-agent',
    spans =>
      spans.some(span => getSpanOp(span) === 'rpc' && span.name === 'greet') &&
      spans.some(span => span.is_segment && span.name === 'webSocketMessage'),
  );

  await page.goto(baseURL!);

  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Call Agent' }).click();
  await expect(page.getByText('Hello, World!')).toBeVisible();

  const requestSpan = await requestSpanPromise;

  expect(requestSpan).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    name: 'GET',
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    status: 'ok',
    is_segment: true,
    attributes: expect.objectContaining({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.cloudflare', type: 'string' },
      'sentry.segment.name.source': { value: 'url', type: 'string' },
      'http.request.method': { value: 'GET', type: 'string' },
      'url.path': { value: '/agents/my-agent/user-123', type: 'string' },
      'sentry.environment': { value: expect.any(String), type: 'string' },
    }),
  });

  // greet() touches 6 storage keys: 2 user ops + 3 framework-internal keys (cf_, __ps_, /) that
  // must be filtered + 1 allowlisted cf_ key. Spans carry no key attribute, so filtering can only
  // be verified by count — exactly these 3 storage spans (in execution order) should survive, and
  // any framework-internal span leaking through shows up as an extra entry here.
  const spans = await storageSpansPromise;
  const rpcSpan = spans.find(span => getSpanOp(span) === 'rpc' && span.name === 'greet')!;

  const storageSpans = spans
    .filter(
      span =>
        span.parent_span_id === rpcSpan.span_id &&
        span.attributes['sentry.origin']?.value === 'auto.db.cloudflare.durable_object',
    )
    .sort((a, b) => a.start_timestamp - b.start_timestamp);

  expect(storageSpans).toEqual([
    {
      name: 'durable_object_storage_put',
      attributes: expect.objectContaining({
        'db.operation.name': { value: 'put', type: 'string' },
        'db.system.name': { value: 'cloudflare.durable_object.storage', type: 'string' },
        'sentry.op': { value: 'db', type: 'string' },
        'sentry.origin': { value: 'auto.db.cloudflare.durable_object', type: 'string' },
      }),
      parent_span_id: rpcSpan.span_id,
      span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      status: 'ok',
      is_segment: false,
      trace_id: rpcSpan.trace_id,
    },
    {
      name: 'durable_object_storage_get',
      attributes: expect.objectContaining({
        'db.operation.name': { value: 'get', type: 'string' },
        'db.system.name': { value: 'cloudflare.durable_object.storage', type: 'string' },
        'sentry.op': { value: 'db', type: 'string' },
        'sentry.origin': { value: 'auto.db.cloudflare.durable_object', type: 'string' },
      }),
      parent_span_id: rpcSpan.span_id,
      span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      status: 'ok',
      is_segment: false,
      trace_id: rpcSpan.trace_id,
    },
    {
      name: 'durable_object_storage_get',
      attributes: expect.objectContaining({
        'db.operation.name': { value: 'get', type: 'string' },
        'db.system.name': { value: 'cloudflare.durable_object.storage', type: 'string' },
        'sentry.op': { value: 'db', type: 'string' },
        'sentry.origin': { value: 'auto.db.cloudflare.durable_object', type: 'string' },
      }),
      parent_span_id: rpcSpan.span_id,
      span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      status: 'ok',
      is_segment: false,
      trace_id: rpcSpan.trace_id,
    },
  ]);
});

test('does not emit db.query spans for the agents runtime `cf_`-prefixed internal tables', async ({
  page,
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'cloudflare-agent',
    span =>
      getSpanOp(span) === 'http.server' &&
      span.attributes['url.path']?.value === '/agents/my-agent/user-123' &&
      span.parent_span_id !== undefined,
  );

  await page.goto(baseURL!);

  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Call Agent' }).click();
  await expect(page.getByText('Hello, World!')).toBeVisible();

  const spans = await spansPromise;

  // The agents runtime constantly queries its own `cf_agents_*` / `cf_agent_*` bookkeeping tables.
  // These are framework internals and are filtered out by default, so no such span should leak.
  const internalTableSpans = spans.filter(
    span => getSpanOp(span) === 'db.query' && /\bcf_/.test(String(span.attributes['db.query.summary']?.value ?? '')),
  );

  expect(internalTableSpans).toEqual([]);
});

test('creates an rpc span named after the @callable() method', async ({ page, baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'cloudflare-agent',
    spans =>
      spans.some(span => getSpanOp(span) === 'rpc' && span.name === 'greet') &&
      spans.some(span => span.is_segment && span.name === 'webSocketMessage'),
  );

  await page.goto(baseURL!);

  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Call Agent' }).click();
  await expect(page.getByText('Hello, World!')).toBeVisible();

  const spans = await spansPromise;
  const rpcSpan = spans.find(span => getSpanOp(span) === 'rpc' && span.name === 'greet')!;

  const rpcSpans = spans.filter(span => getSpanOp(span) === 'rpc');
  expect(rpcSpans).toHaveLength(1);

  expect(rpcSpan.attributes['sentry.op']?.value).toBe('rpc');
  expect(rpcSpan.attributes['sentry.origin']?.value).toBe('auto.faas.cloudflare.agents');
  expect(rpcSpan.attributes['gen_ai.agent.name']?.value).toBe('MyBaseAgent');
});
