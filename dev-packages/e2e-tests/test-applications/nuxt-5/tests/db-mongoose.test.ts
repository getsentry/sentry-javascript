import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

// The Nitro bundle force-inlines the instrumented drivers while their CommonJS dependencies and
// Node builtins stay external, and every `require()` across that boundary needs working interop
// (#24775). mongoose covers both: `new mquery()`, and SCRAM-SHA-1 auth lazily requiring `crypto`.
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

  const mongooseSpans = spans.filter(
    span => span.attributes['sentry.origin']?.value === 'auto.db.mongoose.diagnostic_channel',
  );
  expect(mongooseSpans).toHaveLength(2);

  const saveSpan = mongooseSpans.find(span => span.name === 'save blogposts');
  expect(saveSpan?.status).toBe('ok');
  expect(saveSpan?.is_segment).toBe(false);
  expect(saveSpan?.attributes['sentry.op']).toEqual({ type: 'string', value: 'db' });
  expect(saveSpan?.attributes['db.system.name']).toEqual({ type: 'string', value: 'mongodb' });
  expect(saveSpan?.attributes['db.namespace']).toEqual({ type: 'string', value: 'test' });
  expect(saveSpan?.attributes['db.collection.name']).toEqual({ type: 'string', value: 'blogposts' });
  expect(saveSpan?.attributes['db.operation.name']).toEqual({ type: 'string', value: 'save' });

  const findOneSpan = mongooseSpans.find(span => span.name === 'findOne blogposts');
  expect(findOneSpan?.status).toBe('ok');
  expect(findOneSpan?.is_segment).toBe(false);
  expect(findOneSpan?.attributes['sentry.op']).toEqual({ type: 'string', value: 'db' });
  expect(findOneSpan?.attributes['db.system.name']).toEqual({ type: 'string', value: 'mongodb' });
  expect(findOneSpan?.attributes['db.namespace']).toEqual({ type: 'string', value: 'test' });
  expect(findOneSpan?.attributes['db.collection.name']).toEqual({ type: 'string', value: 'blogposts' });
  expect(findOneSpan?.attributes['db.operation.name']).toEqual({ type: 'string', value: 'findOne' });
  expect(findOneSpan?.attributes['db.query.text']).toEqual({ type: 'string', value: '{"title":"?"}' });
});
