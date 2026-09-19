import type { Envelope, SerializedStreamedSpan } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpansFromEnvelope } from '../../spanUtils';

// `cloudflare.d1.duration` is only an integer when the query happens to take a whole number of
// milliseconds, so the type can't be pinned down.
const NUMBER_ATTRIBUTE = { type: expect.stringMatching(/^(?:integer|double)$/), value: expect.any(Number) };

it('instruments D1 prepare().all() automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      // The D1 span is named after its query summary rather than the full query text.
      const querySpan = spans.find(span => span.attributes['db.operation.name']?.value === 'all');
      expect(querySpan?.name).toBe('SELECT users');
      expect(querySpan?.parent_span_id).toBe(segmentSpan?.span_id);
      expect(querySpan?.status).toBe('ok');
      expect(querySpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': { type: 'string', value: 'db.query' },
          'sentry.origin': { type: 'string', value: 'auto.db.cloudflare.d1' },
          'db.system.name': { type: 'string', value: 'cloudflare-d1' },
          'db.operation.name': { type: 'string', value: 'all' },
          'db.query.text': { type: 'string', value: 'SELECT * FROM users WHERE id = ?' },
          'db.query.summary': { type: 'string', value: 'SELECT users' },
          'cloudflare.d1.duration': NUMBER_ATTRIBUTE,
          'cloudflare.d1.rows_read': NUMBER_ATTRIBUTE,
          'cloudflare.d1.rows_written': NUMBER_ATTRIBUTE,
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/prepare');
  await runner.completed();
});

it('captures error event when a D1 query references a non-existent table', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('span')
    .expect((envelope: Envelope) => {
      expect(envelope[1][0]?.[0]?.type).toBe('event');
      const event = envelope[1][0]![1] as Record<string, unknown>;
      expect(event.level).toBe('error');

      const values = (event.exception as { values: Array<Record<string, unknown>> })?.values;
      expect(values).toHaveLength(2);

      expect(values).toEqual([
        {
          type: 'Error',
          value: 'no such table: non_existent_table: SQLITE_ERROR',
          stacktrace: expect.any(Object),
          mechanism: {
            type: 'chained',
            handled: true,
            source: 'cause',
            exception_id: 1,
            parent_id: 0,
          },
        },
        {
          type: 'Error',
          value: 'D1_ERROR: no such table: non_existent_table: SQLITE_ERROR',
          stacktrace: expect.any(Object),
          mechanism: {
            type: 'auto.http.cloudflare',
            handled: false,
            exception_id: 0,
          },
        },
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

it('instruments D1 exec() automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      const execSpan = spans.find(span => span.attributes['db.operation.name']?.value === 'exec');
      expect(execSpan?.name).toBe('CREATE TABLE users');
      expect(execSpan?.parent_span_id).toBe(segmentSpan?.span_id);
      expect(execSpan?.status).toBe('ok');
      expect(execSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': { type: 'string', value: 'db.query' },
          'sentry.origin': { type: 'string', value: 'auto.db.cloudflare.d1' },
          'db.system.name': { type: 'string', value: 'cloudflare-d1' },
          'db.operation.name': { type: 'string', value: 'exec' },
          'db.query.text': {
            type: 'string',
            value: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
          },
          'db.query.summary': { type: 'string', value: 'CREATE TABLE users' },
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/exec');
  await runner.completed();
});

it('instruments D1 withSession().batch() identically to db.batch()', async ({ signal }) => {
  let directBatchSpan: SerializedStreamedSpan | undefined;
  let sessionBatchSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      const spans = getSpansFromEnvelope(envelope);
      // Both routes are raw URLs, so the streamed segment name keeps the method only and the
      // request is identified through `url.path`.
      expect(spans.find(span => span.is_segment)?.attributes['url.path']).toEqual({
        type: 'string',
        value: '/batch',
      });

      directBatchSpan = spans.find(span => span.name === 'D1 batch');
    })
    .expect((envelope: Envelope) => {
      const spans = getSpansFromEnvelope(envelope);
      expect(spans.find(span => span.is_segment)?.attributes['url.path']).toEqual({
        type: 'string',
        value: '/with-session/batch',
      });

      sessionBatchSpan = spans.find(span => span.name === 'D1 batch');
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/batch');
  await runner.makeRequest('get', '/with-session/batch');
  await runner.completed();

  expect(directBatchSpan).toBeDefined();
  expect(sessionBatchSpan).toBeDefined();

  // Ids and timestamps differ between the two requests, everything else must match.
  const normalize = (span: SerializedStreamedSpan): Record<string, unknown> => {
    const {
      span_id: _spanId,
      parent_span_id: _parentSpanId,
      start_timestamp: _start,
      end_timestamp: _end,
      trace_id: _traceId,
      attributes,
      ...rest
    } = span;
    const { 'sentry.segment.id': _segmentId, ...restAttributes } = attributes;
    return { ...rest, attributes: restAttributes };
  };

  expect(normalize(sessionBatchSpan!)).toEqual(normalize(directBatchSpan!));
});

it('instruments D1 batch() automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      const batchSpan = spans.find(span => span.name === 'D1 batch');
      expect(batchSpan?.parent_span_id).toBe(segmentSpan?.span_id);
      expect(batchSpan?.status).toBe('ok');
      expect(batchSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': { type: 'string', value: 'db.query' },
          'sentry.origin': { type: 'string', value: 'auto.db.cloudflare.d1' },
          'db.system.name': { type: 'string', value: 'cloudflare-d1' },
          'db.operation.name': { type: 'string', value: 'batch' },
          'db.query.text': {
            type: 'string',
            value: 'INSERT INTO users (name) VALUES (?)\nINSERT INTO users (name) VALUES (?)',
          },
          'db.operation.batch.size': { type: 'integer', value: 2 },
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/batch');
  await runner.completed();
});
