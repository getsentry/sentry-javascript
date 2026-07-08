import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function envelopeItemType(envelope: Envelope): string | undefined {
  return envelope[1][0]?.[0]?.type as string | undefined;
}

function envelopeItem(envelope: Envelope): Record<string, unknown> {
  return envelope[1][0]![1] as Record<string, unknown>;
}

function findSpans(envelope: Envelope, description: string): Array<Record<string, unknown>> {
  if (envelopeItemType(envelope) !== 'transaction') return [];
  const tx = envelopeItem(envelope);
  const spans = (tx.spans as Array<Record<string, unknown>>) || [];
  return spans.filter(s => s.description === description);
}

function spanData(span: Record<string, unknown>): Record<string, unknown> {
  return span.data as Record<string, unknown>;
}

it('emits a ratelimit span with the binding name and success outcome', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const spans = findSpans(envelope, 'rate_limit MY_RATE_LIMITER');
      expect(spans).toHaveLength(1);
      const data = spanData(spans[0]!);
      expect({
        op: spans[0]!.op,
        description: spans[0]!.description,
        'cloudflare.rate_limit.binding': data['cloudflare.rate_limit.binding'],
        'cloudflare.rate_limit.success': data['cloudflare.rate_limit.success'],
        'sentry.origin': data['sentry.origin'],
      }).toEqual({
        op: 'ratelimit',
        description: 'rate_limit MY_RATE_LIMITER',
        'cloudflare.rate_limit.binding': 'MY_RATE_LIMITER',
        'cloudflare.rate_limit.success': true,
        'sentry.origin': 'auto.faas.cloudflare.rate_limit',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/ratelimit/limit');
  await runner.completed();
});
