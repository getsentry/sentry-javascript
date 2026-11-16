import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Instruments mysql in a page that queries the database while it renders', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-4',
    span => span.attributes['url.path']?.value === '/db-ssr',
  );

  const response = await fetch(`${baseURL}/db-ssr`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<p id="solution">2</p>');

  const spans = await spansPromise;
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/db-ssr');
  const mysqlSpans = spans.filter(
    span => span.trace_id === rootSpan?.trace_id && span.attributes['sentry.origin']?.value === 'auto.db.mysql',
  );

  expect(mysqlSpans).toHaveLength(1);
  expect(mysqlSpans[0]).toEqual(
    expect.objectContaining({
      name: 'SELECT',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db' },
        'db.system.name': { type: 'string', value: 'mysql' },
        'db.query.text': { type: 'string', value: 'SELECT ? + ? AS solution' },
      }),
    }),
  );
});
