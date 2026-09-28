import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

// Build-time instrumentation force-inlines the instrumented drivers into the Nitro bundle while
// their CommonJS dependencies and the Node builtins stay external. Every `require()` that crosses
// that boundary needs a working interop, or the driver breaks at startup or on first use
// (https://github.com/getsentry/sentry-javascript/issues/24775). mongoose exercises both kinds:
// its external dependencies are called directly (`new mquery()`), and SCRAM-SHA-1 auth lazily
// `require()`s the `crypto` builtin.
async function collectRequestSpans() {
  const spans = await collectStreamedSpansUntilSegment(
    'nuxt-5',
    span => span.attributes['url.path']?.value === '/api/db-mongoose',
  );
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/api/db-mongoose');

  return spans.filter(span => span.trace_id === rootSpan?.trace_id);
}

test('Instruments mongoose automatically', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans();

  const response = await fetch(`${baseURL}/api/db-mongoose`);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ title: 'test-post' });

  const spans = await spansPromise;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'save blogposts',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db' },
        'sentry.origin': { type: 'string', value: 'auto.db.mongoose.diagnostic_channel' },
        'db.system.name': { type: 'string', value: 'mongodb' },
        'db.namespace': { type: 'string', value: 'test' },
        'db.collection.name': { type: 'string', value: 'blogposts' },
        'db.operation.name': { type: 'string', value: 'save' },
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'findOne blogposts',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db' },
        'sentry.origin': { type: 'string', value: 'auto.db.mongoose.diagnostic_channel' },
        'db.system.name': { type: 'string', value: 'mongodb' },
        'db.namespace': { type: 'string', value: 'test' },
        'db.collection.name': { type: 'string', value: 'blogposts' },
        'db.operation.name': { type: 'string', value: 'findOne' },
        'db.query.text': { type: 'string', value: '{"title":"?"}' },
      }),
    }),
  );
});
