import { expect, it } from 'vitest';
import type { TransactionEvent } from '@sentry/core';
import { createRunner } from '../../../runner';

it('creates a fiber span for a runFiber() invocation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;

      const fiberSpan = (transaction.spans ?? []).find(
        span => span.op === 'function' && span.description === 'refreshTokens',
      );
      expect(fiberSpan).toEqual(
        expect.objectContaining({
          op: 'function',
          description: 'refreshTokens',
          origin: 'auto.faas.cloudflare.agents',
          data: expect.objectContaining({
            'cloudflare.agent.fiber.id': expect.any(String),
            'cloudflare.agent.fiber.name': 'refreshTokens',
          }),
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/agents/my-agent/fiber-instance/fiber');
  await runner.completed();
});
