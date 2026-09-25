import { expect, test } from '@playwright/test';
import { getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Instruments MySQL via Orchestrion', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'node-express-v5',
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
