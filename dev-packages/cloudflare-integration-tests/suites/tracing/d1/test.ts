import { expect, it } from 'vitest';
import type { Envelope, SerializedStreamedSpan } from '@sentry/core';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';
import {
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

/** The `db.query` spans of an envelope, paired with the segment span they belong to. */
function getD1Spans(envelope: Envelope): {
  segmentSpan: SerializedStreamedSpan;
  d1Spans: SerializedStreamedSpan[];
} {
  const spans = getSpansFromEnvelope(envelope);
  const segmentSpan = spans.find(span => span.is_segment);
  expect(segmentSpan).toBeDefined();

  return {
    segmentSpan: segmentSpan!,
    d1Spans: spans.filter(span => getSpanOp(span) === 'db.query'),
  };
}

function commonAttributes(segmentSpan: SerializedStreamedSpan): SerializedStreamedSpan['attributes'] {
  return {
    [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
    [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
    [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
    [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan.span_id },
    [SENTRY_SEGMENT_NAME]: { type: 'string', value: segmentSpan.name },
    [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'db.query' },
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.cloudflare.d1' },
    'db.system.name': { type: 'string', value: 'cloudflare-d1' },
  };
}

function commonSpanProps(segmentSpan: SerializedStreamedSpan): Record<string, unknown> {
  return {
    is_segment: false,
    parent_span_id: segmentSpan.span_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    trace_id: segmentSpan.trace_id,
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    status: 'ok',
  };
}

// `cloudflare.d1.duration` is only an integer when the query happens to take a whole
// number of milliseconds, so the type can't be pinned down.
const NUMBER_ATTRIBUTE = { type: expect.stringMatching(/^(?:integer|double)$/), value: expect.any(Number) };

it('names D1 query spans after their query summary', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const { segmentSpan, d1Spans } = getD1Spans(envelope);
      // With span streaming, the server span name is low cardinality, so the request the
      // envelope belongs to is only identifiable through `url.path`.
      expect(segmentSpan.name).toBe('GET');
      expect(segmentSpan.attributes['url.path']).toEqual({ type: 'string', value: '/init' });

      expect(d1Spans).toEqual([
        {
          name: 'CREATE TABLE users',
          attributes: {
            ...commonAttributes(segmentSpan),
            'db.operation.name': { type: 'string', value: 'exec' },
            'db.query.text': {
              type: 'string',
              value: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
            },
            'db.query.summary': { type: 'string', value: 'CREATE TABLE users' },
          },
          ...commonSpanProps(segmentSpan),
        },
        {
          name: 'INSERT users',
          attributes: {
            ...commonAttributes(segmentSpan),
            'db.operation.name': { type: 'string', value: 'run' },
            'db.query.text': { type: 'string', value: 'INSERT INTO users (name) VALUES (?)' },
            'db.query.summary': { type: 'string', value: 'INSERT users' },
            'cloudflare.d1.duration': NUMBER_ATTRIBUTE,
            'cloudflare.d1.rows_read': NUMBER_ATTRIBUTE,
            'cloudflare.d1.rows_written': NUMBER_ATTRIBUTE,
          },
          ...commonSpanProps(segmentSpan),
        },
      ]);
    })
    .expect(envelope => {
      const { segmentSpan, d1Spans } = getD1Spans(envelope);
      expect(segmentSpan.name).toBe('GET');
      expect(segmentSpan.attributes['url.path']).toEqual({ type: 'string', value: '/query' });

      expect(d1Spans).toEqual([
        {
          name: 'SELECT users',
          attributes: {
            ...commonAttributes(segmentSpan),
            'db.operation.name': { type: 'string', value: 'first' },
            'db.query.text': { type: 'string', value: 'SELECT * FROM users WHERE name = ?' },
            'db.query.summary': { type: 'string', value: 'SELECT users' },
          },
          ...commonSpanProps(segmentSpan),
        },
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/init');
  await runner.makeRequest('get', '/query');
  await runner.completed();
});
