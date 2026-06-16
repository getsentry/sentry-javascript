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
          'cloudflare.d1.duration': expect.any(Number),
          'cloudflare.d1.query_type': 'all',
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
