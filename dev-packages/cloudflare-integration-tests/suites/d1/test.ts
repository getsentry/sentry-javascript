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
