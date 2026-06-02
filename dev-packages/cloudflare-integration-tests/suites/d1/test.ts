import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function envelopeItemType(envelope: Envelope): string | undefined {
  return envelope[1][0]?.[0]?.type as string | undefined;
}

function envelopeItem(envelope: Envelope): Record<string, unknown> {
  return envelope[1][0]![1] as Record<string, unknown>;
}

function findD1Spans(envelope: Envelope): Array<Record<string, unknown>> {
  if (envelopeItemType(envelope) !== 'transaction') return [];
  const tx = envelopeItem(envelope);
  const spans = (tx.spans as Array<Record<string, unknown>>) || [];
  return spans.filter(s => (s.op as string) === 'db.query');
}

it('instruments D1 prepare().all() automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      if (envelopeItemType(envelope) !== 'transaction') return;
      const d1Spans = findD1Spans(envelope);
      expect(d1Spans.length).toBeGreaterThanOrEqual(1);

      const querySpan = d1Spans.find(s => s.description === 'SELECT * FROM users WHERE id = ?');
      expect(querySpan).toBeDefined();
      expect(querySpan).toEqual({
        data: {
          'db.system.name': 'cloudflare-d1',
          'db.operation.name': 'all',
          'db.query.text': 'SELECT * FROM users WHERE id = ?',
          'cloudflare.d1.duration': expect.any(Number),
          'cloudflare.d1.rows_read': expect.any(Number),
          'cloudflare.d1.rows_written': expect.any(Number),
          'sentry.op': 'db.query',
          'sentry.origin': 'auto.db.cloudflare.d1',
        },
        description: 'SELECT * FROM users WHERE id = ?',
        op: 'db.query',
        origin: 'auto.db.cloudflare.d1',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/prepare');
  await runner.completed();
});

it('captures error event when a D1 query references a non-existent table', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('transaction')
    .expect((envelope: Envelope) => {
      expect(envelopeItemType(envelope)).toBe('event');
      const event = envelopeItem(envelope);
      expect(event.level).toBe('error');

      const values = (event.exception as { values: Array<Record<string, unknown>> })?.values;
      expect(values).toHaveLength(2);

      expect(values).toEqual([
        {
          type: 'Error',
          value: 'no such table: non_existent_table: SQLITE_ERROR',
          stacktrace: expect.any(Object),
          mechanism: {
            type: 'auto.http.cloudflare',
            handled: false,
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
            type: 'generic',
            handled: true,
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
      if (envelopeItemType(envelope) !== 'transaction') return;
      const d1Spans = findD1Spans(envelope);

      const execSpan = d1Spans.find(
        s => s.description === 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
      );
      expect(execSpan).toBeDefined();
      expect(execSpan).toEqual({
        data: {
          'db.system.name': 'cloudflare-d1',
          'db.operation.name': 'exec',
          'db.query.text': 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
          'sentry.op': 'db.query',
          'sentry.origin': 'auto.db.cloudflare.d1',
        },
        description: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
        op: 'db.query',
        origin: 'auto.db.cloudflare.d1',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/exec');
  await runner.completed();
});

it('does not double-instrument when instrumentD1WithSentry is used on top of env instrumentation', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      if (envelopeItemType(envelope) !== 'transaction') return;
      const d1Spans = findD1Spans(envelope);

      const querySpans = d1Spans.filter(s => s.description === 'SELECT * FROM users WHERE id = ?');
      expect(querySpans).toHaveLength(1);
    })
    .start(signal);

  const response = await runner.makeRequest('get', '/double-instrument');
  expect(response).toBe('true');
  await runner.completed();
});

it('instruments D1 withSession().batch() identically to db.batch()', async ({ signal }) => {
  let directBatchSpan: Record<string, unknown> | undefined;
  let sessionBatchSpan: Record<string, unknown> | undefined;

  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      expect(envelopeItem(envelope).transaction).toBe('GET /batch');

      directBatchSpan = findD1Spans(envelope).find(s => s.description === 'D1 batch');
    })
    .expect((envelope: Envelope) => {
      expect(envelopeItem(envelope).transaction).toBe('GET /with-session/batch');

      sessionBatchSpan = findD1Spans(envelope).find(s => s.description === 'D1 batch');
    })
    .start(signal);

  await runner.makeRequest('get', '/batch');
  await runner.makeRequest('get', '/with-session/batch');
  await runner.completed();

  expect(directBatchSpan).toBeDefined();
  expect(sessionBatchSpan).toBeDefined();

  const normalize = (span: Record<string, unknown>): Record<string, unknown> => {
    const {
      span_id: _spanId,
      parent_span_id: _parentSpanId,
      start_timestamp: _start,
      timestamp: _end,
      trace_id: _traceId,
      ...rest
    } = span;
    return rest;
  };

  expect(normalize(sessionBatchSpan!)).toEqual(normalize(directBatchSpan!));
});

it('instruments D1 batch() automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      if (envelopeItemType(envelope) !== 'transaction') return;
      const d1Spans = findD1Spans(envelope);

      const batchSpan = d1Spans.find(s => s.description === 'D1 batch');
      expect(batchSpan).toBeDefined();
      expect(batchSpan).toEqual({
        data: {
          'db.system.name': 'cloudflare-d1',
          'db.operation.name': 'batch',
          'db.query.text': 'INSERT INTO users (name) VALUES (?)\nINSERT INTO users (name) VALUES (?)',
          'db.operation.batch.size': 2,
          'sentry.op': 'db.query',
          'sentry.origin': 'auto.db.cloudflare.d1',
        },
        description: 'D1 batch',
        op: 'db.query',
        origin: 'auto.db.cloudflare.d1',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/batch');
  await runner.completed();
});
